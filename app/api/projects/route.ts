import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { requireRole } from '@/app/api/middleware/auth';
import { AuthorizationService } from '@/app/api/middleware/authorization';
import { generateSafeStorageFileName } from '@/lib/file-utils';

interface FileFormData {
  file_name: string;
  page_count: string;
  assigned_to: {
    user_id: string;
    name: string;
    email: string;
    role: string;
    assigned_at: string;
  }[];
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication and project manager role
    const roleResult = await requireRole(request, ['projectManager']);
    if (roleResult instanceof NextResponse) {
      return roleResult; // Return error response
    }
    const authenticatedUser = roleResult;

    // Verify user can create projects
    const canCreate = await AuthorizationService.canCreateProject(authenticatedUser.id);
    if (!canCreate) {
      return NextResponse.json(
        { error: 'You do not have permission to create projects' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    // Check content type to handle both JSON and FormData
    const contentType = request.headers.get('content-type') || '';
    let projectData, fileGroups, selectedFiles, formData = null;

    if (contentType.includes('application/json')) {
      // Handle legacy JSON format
      const jsonData = await request.json();
      projectData = jsonData.projectData;
      fileGroups = jsonData.fileGroups;
      selectedFiles = jsonData.selectedFiles;
    } else {
      // Handle new FormData format
      formData = await request.formData();
      const projectDataStr = formData.get('projectData') as string;
      const fileGroupsStr = formData.get('fileGroups') as string;
      const selectedFilesStr = formData.get('selectedFiles') as string;

      if (!projectDataStr || !fileGroupsStr || !selectedFilesStr) {
        return NextResponse.json(
          { error: 'Project data, file groups, and selected files are required' },
          { status: 400 }
        );
      }

      // Parse JSON strings
      projectData = JSON.parse(projectDataStr);
      fileGroups = JSON.parse(fileGroupsStr);
      selectedFiles = JSON.parse(selectedFilesStr);
    }

    const referenceFile = formData ? (formData.get('reference_file') as File) : null;

    if (!projectData || !fileGroups || !selectedFiles) {
      return NextResponse.json(
        { error: 'Project data, file groups, and selected files are required' },
        { status: 400 }
      );
    }



    // 1. Create project in projects_test table
    const { data: projectResult, error: projectError } = await supabase
      .from("projects_test")
      .insert([
        {
          ...projectData,
        },
      ])
      .select("project_id")
      .single();

    if (projectError) {
      console.error('Project creation error:', projectError);
      return NextResponse.json(
        { error: 'Failed to create project', details: projectError.message },
        { status: 400 }
      );
    }

    const projectId = projectResult.project_id;

    // 1.5. Handle reference file upload if exists
    if (referenceFile) {
      const safeReferenceName = generateSafeStorageFileName(referenceFile.name);
      const referencePath = `${projectId}/${safeReferenceName}`;

      const { error: uploadError } = await supabase.storage
        .from("project-references")
        .upload(referencePath, referenceFile, {
          contentType: referenceFile.type || 'application/octet-stream',
          upsert: false
        });

      if (!uploadError) {
        // Update project with the actual reference file path
        await supabase
          .from("projects_test")
          .update({ reference_file: referenceFile.name + "|" + referencePath })
          .eq("project_id", projectId);
      } else {
        console.error('Reference file upload error:', uploadError);
        // We continue even if reference file fails, but maybe log it
      }
    }

    // 2. Create tasks and files for each group
    for (let groupIndex = 0; groupIndex < fileGroups.length; groupIndex++) {
      const group = fileGroups[groupIndex];

      // Create task - normalize task_type (empty string to null) and remove processor_type if it doesn't exist in table
      const { processor_type: _processor_type, ...taskDataWithoutProcessorType } = group.taskData;

      // Ensure task_name is set - use project_name-{index} if empty
      const taskName = group.taskData.task_name && group.taskData.task_name.trim() !== ''
        ? group.taskData.task_name
        : `${projectData.project_name}-${groupIndex + 1}`;

      // Fallback to project-level values if task-level values are empty
      const taskType = group.taskData.task_type && group.taskData.task_type.trim() !== ''
        ? group.taskData.task_type
        : (projectData.task_type || null);
      const fileType = group.taskData.file_type && group.taskData.file_type.trim() !== ''
        ? group.taskData.file_type
        : (projectData.file_type || null);
      const fileFormat = group.taskData.file_format && group.taskData.file_format.trim() !== ''
        ? group.taskData.file_format
        : (projectData.file_format || null);
      const customFileFormat = group.taskData.custom_file_format && group.taskData.custom_file_format.trim() !== ''
        ? group.taskData.custom_file_format
        : (projectData.custom_file_format || null);
      const clientInstruction = group.taskData.client_instruction && group.taskData.client_instruction.trim() !== ''
        ? group.taskData.client_instruction
        : (projectData.client_instructions || null);

      const taskDataToInsert = {
        ...taskDataWithoutProcessorType,
        project_id: projectId,
        task_name: taskName,
        task_type: taskType,
        file_type: fileType,
        file_format: fileFormat,
        custom_file_format: customFileFormat,
        client_instruction: clientInstruction,
      };

      const { data: taskResult, error: taskError } = await supabase
        .from("tasks_test")
        .insert([taskDataToInsert])
        .select("task_id")
        .single();

      if (taskError) {
        console.error('Task creation error:', taskError);
        return NextResponse.json(
          { error: `Failed to create task ${groupIndex + 1}`, details: taskError.message },
          { status: 400 }
        );
      }

      const taskId = taskResult.task_id;

      // Create task iteration
      const { data: _taskIterationResult, error: taskIterationError } =
        await supabase.from("task_iterations").insert([
          {
            task_id: taskId,
            iteration_number: 1,
            current_stage: "Processor",
            sent_by: "PM",
            stages: ["PM"],
            notes: "",
          },
        ]);

      if (taskIterationError) {
        return NextResponse.json(
          { error: 'Failed to create task iteration' },
          { status: 400 }
        );
      }

      // Create process logs
      const { data: _process_logs, error: process_logsError } = await supabase
        .from("process_logs_test")
        .insert([
          {
            task_id: taskId,
            current_stage: "Processor",
            sent_by: "PM",
            assigned_to: [],
          },
        ]);

      if (process_logsError) {
        return NextResponse.json(
          { error: 'Failed to create process logs' },
          { status: 400 }
        );
      }

      // Upload files to storage with proper file handling
      for (const fileData of group.filesData) {
        const originalFileName = fileData.file_name;
        const safeStorageFileName = generateSafeStorageFileName(originalFileName);
        const filePath = `${taskId}/${safeStorageFileName}`;

        // Get the actual file from FormData using group and file indices
        let actualFile: File | null = null;
        if (formData) {
          // Find the file index within this group's filesData array
          const fileIndex = group.filesData.findIndex((f: FileFormData) => f.file_name === originalFileName);

          // Try the new format first: file_group_X_file_Y
          const newFormatKey = `file_group_${groupIndex}_file_${fileIndex}`;
          actualFile = formData.get(newFormatKey) as File;

          // Fallback to old format for backward compatibility
          if (!actualFile) {
            actualFile = formData.get(`file_${taskId}_${originalFileName}`) as File;
          }
        }

        if (!actualFile) {
          // Skip this file if not found in FormData - for backward compatibility
          // In the future, all files should be provided in FormData
          continue;
        }

        // Get file extension and determine file type
        const fileExtension = originalFileName.split('.').pop()?.toLowerCase() || '';
        // Define supported file types (same as in files API)
        // const supportedTypes: Record<string, string[]> = {
        //   documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
        //   images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg', 'webp'],
        //   spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
        //   presentations: ['ppt', 'pptx', 'odp'],
        //   archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
        //   audio: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
        //   video: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'],
        //   code: ['js', 'ts', 'html', 'css', 'json', 'xml', 'sql', 'py', 'java', 'cpp', 'c'],
        //   other: []
        // };

        // Determine file category
        // let fileCategory = 'other';
        // for (const [category, extensions] of Object.entries(supportedTypes)) {
        //   if (extensions.includes(fileExtension)) {
        //     fileCategory = category;
        //     break;
        //   }
        // }

        // Determine MIME type based on extension (comprehensive mapping)
        const mimeTypes: Record<string, string> = {
          // Documents
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'txt': 'text/plain',
          'rtf': 'application/rtf',
          'odt': 'application/vnd.oasis.opendocument.text',

          // Images
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'bmp': 'image/bmp',
          'tiff': 'image/tiff',
          'svg': 'image/svg+xml',
          'webp': 'image/webp',

          // Spreadsheets
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'csv': 'text/csv',
          'ods': 'application/vnd.oasis.opendocument.spreadsheet',

          // Presentations
          'ppt': 'application/vnd.ms-powerpoint',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'odp': 'application/vnd.oasis.opendocument.presentation',

          // Archives
          'zip': 'application/x-zip-compressed',
          'rar': 'application/x-rar-compressed',
          '7z': 'application/x-7z-compressed',
          'tar': 'application/x-tar',
          'gz': 'application/gzip',
          'bz2': 'application/x-bzip2',

          // Audio
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'flac': 'audio/flac',
          'aac': 'audio/aac',
          'ogg': 'audio/ogg',

          // Video
          'mp4': 'video/mp4',
          'avi': 'video/x-msvideo',
          'mkv': 'video/x-matroska',
          'mov': 'video/quicktime',
          'wmv': 'video/x-ms-wmv',
          'flv': 'video/x-flv',
          'webm': 'video/webm',

          // Code files
          'js': 'application/javascript',
          'ts': 'application/typescript',
          'html': 'text/html',
          'css': 'text/css',
          'json': 'application/json',
          'xml': 'application/xml',
          'sql': 'application/sql',
          'py': 'text/x-python',
          'java': 'text/x-java-source',
          'cpp': 'text/x-c++src',
          'c': 'text/x-csrc'
        };

        const mimeType = actualFile.type || mimeTypes[fileExtension] || 'application/octet-stream';

        // Upload file with proper content type using actual file blob
        const { error: uploadError } = await supabase.storage
          .from("task-files")
          .upload(filePath, actualFile, {
            contentType: mimeType,
            upsert: false
          });

        if (uploadError) {
          return NextResponse.json(
            { error: `Failed to upload file ${originalFileName}` },
            { status: 400 }
          );
        }

        // Create comprehensive file record
        const { error: fileRecordError } = await supabase
          .from("files_test")
          .insert([
            {
              task_id: taskId,
              file_name: originalFileName,
              storage_name: "task-files",
              assigned_to: fileData.assigned_to,
              file_path: filePath,
              page_count: fileData.page_count,
              // file_extension: fileExtension,
              // file_category: fileCategory,
              // mime_type: mimeType,
              // file_size: actualFile.size,
              uploaded_by: {
                id: authenticatedUser.id,
                name: authenticatedUser.email, // Using email as name fallback
                email: authenticatedUser.email,
                role: authenticatedUser.role
              },
              uploaded_at: new Date().toISOString(),
            },
          ]);

        if (fileRecordError) {
          return NextResponse.json(
            { error: `Failed to create file record for ${originalFileName}` },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({
      message: 'Project created successfully',
      projectId,
    });

  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Require authentication and project manager role
    const roleResult = await requireRole(request, ['projectManager']);
    if (roleResult instanceof NextResponse) {
      return roleResult;
    }
    const authenticatedUser = roleResult;

    const { projectId, ...updateData } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("projects_test")
      .update(updateData)
      .eq("project_id", projectId);

    if (error) {
      console.error('Project update error:', error);
      return NextResponse.json(
        { error: 'Failed to update project', details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: 'Project updated successfully'
    });

  } catch (error: unknown) {
    console.error('Project patch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
