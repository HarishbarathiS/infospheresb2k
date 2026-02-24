// File: components/taskModal.tsx

"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Save,
  Upload,
  Plus,
  Minus,
  FileText,
  Split,
  Info,
  Users,
  Hash,
  User,
  AlertCircle,
} from "lucide-react";
import { toast } from "react-toastify";
import { Progress } from "./ui/progress";
import { Tooltip } from "./ui/tooltip";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

import { api } from "../utils/api";
import { createClient } from "@/lib/client";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskAdded: () => void;
}

interface ProjectFormData {
  project_name: string;
  client_name: string;
  po_hours: number;
  mail_instruction: string;
  reference_file: string;
  delivery_date: string;
  delivery_time: string;
  completion_status: boolean;
  created_by: string;
  task_type: string;
  file_type: string;
  file_format: string;
  custom_file_format: string;
  client_instructions: string;
  language: string;
}

interface TaskFormData {
  task_name: string;
  client_instruction: string;
  processor_type: string[];
  estimated_hours_ocr: number;
  estimated_hours_qc: number;
  estimated_hours_qa: number;
  completion_status: boolean;
  project_id: string;
  created_by: string;
  task_type: string;
  file_type: string;
  file_format: string;
  custom_file_format: string;
}

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

interface FileGroup {
  files: File[];
  taskData: TaskFormData;
  filesData: FileFormData[];
}

interface _TaskIteration {
  task_id: string;
  iteration_number: number;
  current_stage: string;
  sent_by: string;
  assigned_to_processor_user_id: string;
  assigned_to_qc_user_id: string;
  assigned_to_qa_user_id: string;
  notes: string;
  stages: string[];
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Processor extends UserProfile {
  role: "processor";
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onTaskAdded,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [processors, setProcessors] = useState<Processor[]>([]);

  // Project form data
  const [projectData, setProjectData] = useState<ProjectFormData>({
    project_name: "",
    client_name: "",
    po_hours: 0,
    mail_instruction: "",
    reference_file: "",
    delivery_date: "",
    delivery_time: "",
    completion_status: false,
    created_by: "",
    task_type: "",
    file_type: "",
    file_format: "",
    custom_file_format: "",
    client_instructions: "",
    language: "",
  });

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);

  const steps = [
    {
      number: 1,
      title: "Project Information",
      description: "Enter basic project details",
      icon: FileText,
    },
    {
      number: 2,
      title: "File Upload",
      description: "Upload your project files",
      icon: Upload,
    },
    {
      number: 3,
      title: "File Organization",
      description: "Organize files into tasks",
      icon: Split,
    },
    {
      number: 4,
      title: "Task & File Details",
      description: "Configure task settings",
      icon: Save,
    },
  ];

  const progressPercentage = (currentStep / steps.length) * 100;

  const getStepTitle = () => {
    return steps[currentStep - 1].title;
  };

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();

        if (user) {
          const { data: profile, error } = await createClient()
            .from("profiles")
            .select("id, name, email, role")
            .eq("id", user.id)
            .single();

          if (error) throw error;
          setCurrentUser(profile);
          setProjectData((prev) => ({ ...prev, created_by: user.id }));
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    const fetchProcessors = async () => {
      try {
        const result = await api.getAvailableUsers("Processor");
        setProcessors(result.users || []);
      } catch (error) {
        console.error("Error fetching processors:", error);
        toast.error("Failed to load processors");
      }
    };

    if (isOpen) {
      fetchUserProfile();
      fetchProcessors();
    }
  }, [isOpen]);

  const handleProjectChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setProjectData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      // Update task data if file groups are already initialized
      if (fileGroups.length > 0 && (name === 'task_type' || name === 'file_type' || name === 'file_format' || name === 'custom_file_format' || name === 'client_instructions' || name === 'project_name')) {
        setFileGroups((prevGroups) =>
          prevGroups.map((group, index) => ({
            ...group,
            taskData: {
              ...group.taskData,
              task_name: name === 'project_name' && value ? `${value}-${index + 1}` : group.taskData.task_name,
              task_type: name === 'task_type' ? value : group.taskData.task_type,
              file_type: name === 'file_type' ? value : group.taskData.file_type,
              file_format: name === 'file_format' ? value : group.taskData.file_format,
              custom_file_format: name === 'custom_file_format' ? value : group.taskData.custom_file_format,
              client_instruction: name === 'client_instructions' ? value : group.taskData.client_instruction,
            },
          }))
        );
      }

      return updated;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setReferenceFile(files[0]);
    }
    e.target.value = "";
  };

  const removeReferenceFile = () => {
    setReferenceFile(null);
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove)
    );
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      // Validate project form
      if (!projectData.project_name.trim()) {
        toast.error("Project name is required");
        return;
      }
      if (!projectData.task_type) {
        toast.error("Task type is required");
        return;
      }
      if (!projectData.file_type) {
        toast.error("File type is required");
        return;
      }
      if (!projectData.file_format) {
        toast.error("File format is required");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (selectedFiles.length === 0) {
        toast.error("Please upload at least one file");
        return;
      }

      // Auto-group files (1 file per group) and skip to task details
      if (selectedFiles.length === 1) {
        initializeSingleFileGroup();
      } else {
        initializeFileGroups();
      }
      setCurrentStep(4); // Skip step 3, go directly to step 4
    } else if (currentStep === 3) {
      if (fileGroups.length === 0) {
        toast.error("Please organize files into groups");
        return;
      }
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const initializeSingleFileGroup = () => {
    setFileGroups([
      {
        files: selectedFiles,
        taskData: {
          task_name: projectData.project_name ? `${projectData.project_name}-1` : "",
          client_instruction: projectData.client_instructions || "",
          processor_type: [],
          estimated_hours_ocr: 0,
          estimated_hours_qc: 0,
          estimated_hours_qa: 0,
          completion_status: false,
          project_id: "",
          created_by: currentUser?.id || "",
          task_type: projectData.task_type || "",
          file_type: projectData.file_type || "",
          file_format: projectData.file_format || "",
          custom_file_format: projectData.custom_file_format || "",
        },
        filesData: selectedFiles.map((file) => ({
          file_name: file.name,
          page_count: "",
          assigned_to: [],
        })),
      },
    ]);
  };

  const initializeFileGroups = () => {
    // Auto-group: 1 file per group
    const groups = selectedFiles.map((file, index) => ({
      files: [file],
      taskData: {
        task_name: projectData.project_name ? `${projectData.project_name}-${index + 1}` : "",
        client_instruction: projectData.client_instructions || "",
        processor_type: [],
        estimated_hours_ocr: 0,
        estimated_hours_qc: 0,
        estimated_hours_qa: 0,
        completion_status: false,
        project_id: "",
        created_by: currentUser?.id || "",
        task_type: projectData.task_type || "",
        file_type: projectData.file_type || "",
        file_format: projectData.file_format || "",
        custom_file_format: projectData.custom_file_format || "",
      },
      filesData: [
        {
          file_name: file.name,
          page_count: "",
          assigned_to: [],
        },
      ],
    }));
    setFileGroups(groups);
  };

  const addFileGroup = () => {
    setFileGroups((prev) => [
      ...prev,
      {
        files: [],
        taskData: {
          task_name: projectData.project_name ? `${projectData.project_name}-${prev.length + 1}` : "",
          client_instruction: projectData.client_instructions || "",
          processor_type: [],
          estimated_hours_ocr: 0,
          estimated_hours_qc: 0,
          estimated_hours_qa: 0,
          completion_status: false,
          project_id: "",
          created_by: currentUser?.id || "",
          task_type: projectData.task_type || "",
          file_type: projectData.file_type || "",
          file_format: projectData.file_format || "",
          custom_file_format: projectData.custom_file_format || "",
        },
        filesData: [],
      },
    ]);
  };

  const removeFileGroup = (groupIndex: number) => {
    if (fileGroups.length > 1) {
      setFileGroups((prev) => prev.filter((_, index) => index !== groupIndex));
    }
  };

  const assignFileToGroup = (fileIndex: number, groupIndexStr: string) => {
    const file = selectedFiles[fileIndex];

    // Remove file from all groups first
    setFileGroups((prev) => {
      const newGroups = prev.map((group) => ({
        ...group,
        files: group.files.filter((f) => f.name !== file.name),
        filesData: group.filesData.filter((fd) => fd.file_name !== file.name),
      }));

      // If groupIndexStr is empty, just remove from all groups
      if (groupIndexStr === "") {
        return newGroups;
      }

      const groupIndex = parseInt(groupIndexStr);

      // Add to the specified group
      if (groupIndex >= 0 && groupIndex < newGroups.length) {
        newGroups[groupIndex].files.push(file);
        newGroups[groupIndex].filesData.push({
          file_name: file.name,
          page_count: "",
          assigned_to: [],
        });
      }

      return newGroups;
    });
  };

  const removeFileFromGroup = (groupIndex: number, fileIndex: number) => {
    setFileGroups((prev) => {
      const newGroups = [...prev];
      newGroups[groupIndex].files.splice(fileIndex, 1);
      newGroups[groupIndex].filesData.splice(fileIndex, 1);
      return newGroups;
    });
  };

  const updateTaskData = (
    groupIndex: number,
    field: keyof TaskFormData,
    value: TaskFormData[keyof TaskFormData]
  ) => {
    setFileGroups((prev) => {
      const newGroups = [...prev];
      newGroups[groupIndex].taskData = {
        ...newGroups[groupIndex].taskData,
        [field]: value,
      };
      return newGroups;
    });
  };

  const updateFileData = (
    groupIndex: number,
    fileIndex: number,
    field: keyof FileFormData,
    value: string | string[]
  ) => {


    // Simple update for non-assignment fields (like page_count)
    setFileGroups((prev) => {
      const newGroups = [...prev];
      newGroups[groupIndex].filesData[fileIndex] = {
        ...newGroups[groupIndex].filesData[fileIndex],
        [field]: value,
      };
      return newGroups;
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);


    try {
      if (!currentUser) {
        toast.error("You must be logged in to create a project");
        return;
      }

      // Construct files object with group and file indices for FormData
      const filesObject: { [key: string]: File } = {};

      if (referenceFile) {
        filesObject['reference_file'] = referenceFile;
      }

      fileGroups.forEach((group, groupIndex) => {
        group.files.forEach((file, fileIndex) => {
          // Use group and file indices as keys since taskId is generated by backend
          const fileKey = `file_group_${groupIndex}_file_${fileIndex}`;
          filesObject[fileKey] = file;
        });
      });



      await api.createProject(
        projectData,
        fileGroups,
        selectedFiles,
        currentUser,
        filesObject
      );

      toast.success("Project created successfully!");
      onTaskAdded();
      onClose();
    } catch (error: unknown) {
      console.error("Error creating project:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create project";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? "" : "hidden"
        }`}
    >
      <div className="fixed inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[100vh] overflow-hidden relative z-10">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{getStepTitle()}</h2>
            <p className="text-sm text-gray-500">
              {steps[currentStep - 1].description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-2 bg-gray-50">
          <div className="flex justify-between mb-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.number}
                  className={cn(
                    "flex flex-col items-center relative",
                    currentStep >= step.number
                      ? "text-blue-600"
                      : "text-gray-400"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      currentStep >= step.number ? "bg-blue-100" : "bg-gray-100"
                    )}
                  >
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span className="text-xs mt-1">{step.title}</span>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "absolute top-4 left-full w-[calc(100%-2rem)] h-[2px]",
                        currentStep > step.number
                          ? "bg-blue-600"
                          : "bg-gray-200"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progressPercentage} className="h-1" />
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Project Name *
                  <Tooltip content="Enter a unique name for your project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <input
                  type="text"
                  name="project_name"
                  value={projectData.project_name}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter project name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Client Name
                  <Tooltip content="Enter the client name for this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={projectData.client_name}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter client name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Language
                  <Tooltip content="Enter the language for this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <input
                  type="text"
                  name="language"
                  value={projectData.language}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter language"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Reference File
                </label>
                {referenceFile ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-gray-50">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm truncate flex-1">{referenceFile.name}</span>
                    <button
                      type="button"
                      onClick={removeReferenceFile}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="reference-file-upload"
                      className="hidden"
                      onChange={handleReferenceFileChange}
                    />
                    <label
                      htmlFor="reference-file-upload"
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 w-full"
                    >
                      <Upload className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Choose reference file</span>
                    </label>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mail Instructions
                  <Tooltip content="Special instructions for email communications">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <textarea
                  name="mail_instruction"
                  value={projectData.mail_instruction}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                  rows={3}
                  placeholder="Enter mail instructions"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Client Instructions
                  <Tooltip content="Default client instructions for all tasks in this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <textarea
                  name="client_instructions"
                  value={projectData.client_instructions}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                  rows={3}
                  placeholder="Enter client instructions"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Task Type *
                  <Tooltip content="Default task type for all tasks in this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <select
                  name="task_type"
                  value={projectData.task_type}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select task type</option>
                  <option value="dtp">DTP</option>
                  <option value="ocr_review">OCR Review</option>
                  <option value="prep">Prep</option>
                  <option value="image_processing">Image Processing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  File Format *
                  <Tooltip content="Default file format for all tasks in this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <select
                  name="file_format"
                  value={projectData.file_format}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select file format</option>
                  <option value="indesign">InDesign</option>
                  <option value="ms_excel">MS Excel</option>
                  <option value="ms_word">MS Word</option>
                  <option value="photoshop">Photoshop</option>
                  <option value="powerpoint">PowerPoint</option>
                  <option value="illustrator">Illustrator</option>
                  <option value="others">Others</option>
                </select>
                {projectData.file_format === "others" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      name="custom_file_format"
                      value={projectData.custom_file_format}
                      onChange={handleProjectChange}
                      className="w-full p-2 border rounded-md"
                      placeholder="Please specify the file format"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  File Type *
                  <Tooltip content="Default file type for all tasks in this project">
                    <Info className="inline-block w-4 h-4 ml-1 text-gray-400" />
                  </Tooltip>
                </label>
                <select
                  name="file_type"
                  value={projectData.file_type}
                  onChange={handleProjectChange}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select file type</option>
                  <option value="editable">Editable</option>
                  <option value="scanned">Scanned</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    name="delivery_date"
                    value={projectData.delivery_date}
                    onChange={handleProjectChange}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Delivery Time
                  </label>
                  <input
                    type="time"
                    name="delivery_time"
                    value={projectData.delivery_time}
                    onChange={handleProjectChange}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="w-12 h-12 text-gray-400 mb-2" />
                  <span className="text-sm font-medium">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-gray-500">
                    Support for multiple files
                  </span>
                </label>
              </div>
              {selectedFiles.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-medium mb-2">Selected Files</h3>
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={`selected-${index}-${file.name}`}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div className="flex items-center">
                          <FileText className="w-4 h-4 mr-2 text-gray-400" />
                          <span className="text-sm">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File Organization Step */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">File Groups</h3>
                <button
                  onClick={addFileGroup}
                  className="flex items-center text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Group
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">Available Files</h4>
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`available-${index}-${file.name}`}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded mb-2"
                    >
                      <span className="text-sm">{file.name}</span>
                      <select
                        onChange={(e) =>
                          assignFileToGroup(index, e.target.value)
                        }
                        className="text-sm border rounded"
                      >
                        <option value="">Select Group</option>
                        {fileGroups.map((_, groupIndex) => (
                          <option key={groupIndex} value={groupIndex}>
                            Group {groupIndex + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {fileGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">Group {groupIndex + 1}</h4>
                        <button
                          onClick={() => removeFileGroup(groupIndex)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {group.files.map((file, fileIndex) => (
                        <div
                          key={`group-${groupIndex}-file-${fileIndex}-${file.name}`}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded mb-2"
                        >
                          <span className="text-sm">{file.name}</span>
                          <button
                            onClick={() =>
                              removeFileFromGroup(groupIndex, fileIndex)
                            }
                            className="text-red-500 hover:text-red-700"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Task Details Step */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {fileGroups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <h3 className="font-medium">
                    Task Group {groupIndex + 1} Details
                  </h3>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Task Name *
                    </label>
                    <input
                      type="text"
                      value={group.taskData.task_name}
                      onChange={(e) =>
                        updateTaskData(groupIndex, "task_name", e.target.value)
                      }
                      className="w-full p-2 border rounded-md"
                      placeholder="Enter task name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Client Instructions
                    </label>
                    <textarea
                      value={group.taskData.client_instruction}
                      onChange={(e) =>
                        updateTaskData(
                          groupIndex,
                          "client_instruction",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border rounded-md"
                      rows={3}
                      placeholder="Enter client instructions"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Task Type *
                    </label>
                    <select
                      value={group.taskData.task_type}
                      onChange={(e) =>
                        updateTaskData(
                          groupIndex,
                          "task_type",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Select task type</option>
                      <option value="dtp">DTP</option>
                      <option value="ocr_review">OCR Review</option>
                      <option value="prep">Prep</option>
                      <option value="image_processing">Image Processing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      File Type *
                    </label>
                    <select
                      value={group.taskData.file_type}
                      onChange={(e) =>
                        updateTaskData(
                          groupIndex,
                          "file_type",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Select file type</option>
                      <option value="editable">Editable</option>
                      <option value="scanned">Scanned</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      File Format *
                    </label>
                    <select
                      value={group.taskData.file_format}
                      onChange={(e) =>
                        updateTaskData(
                          groupIndex,
                          "file_format",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Select file format</option>
                      <option value="indesign">InDesign</option>
                      <option value="ms_excel">MS Excel</option>
                      <option value="ms_word">MS Word</option>
                      <option value="photoshop">Photoshop</option>
                      <option value="powerpoint">PowerPoint</option>
                      <option value="illustrator">Illustrator</option>
                      <option value="others">Others</option>
                    </select>
                    {group.taskData.file_format === "others" && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={group.taskData.custom_file_format}
                          onChange={(e) =>
                            updateTaskData(
                              groupIndex,
                              "custom_file_format",
                              e.target.value
                            )
                          }
                          className="w-full p-2 border rounded-md"
                          placeholder="Please specify the file format"
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Est. Hours (OCR)
                      </label>
                      <input
                        type="number"
                        value={group.taskData.estimated_hours_ocr}
                        onChange={(e) =>
                          updateTaskData(
                            groupIndex,
                            "estimated_hours_ocr",
                            e.target.value
                          )
                        }
                        className="w-full p-2 border rounded-md"
                        placeholder="Hours"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Est. Hours (QC)
                      </label>
                      <input
                        type="number"
                        value={group.taskData.estimated_hours_qc}
                        onChange={(e) =>
                          updateTaskData(
                            groupIndex,
                            "estimated_hours_qc",
                            e.target.value
                          )
                        }
                        className="w-full p-2 border rounded-md"
                        placeholder="Hours"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Est. Hours (QA)
                      </label>
                      <input
                        type="number"
                        value={group.taskData.estimated_hours_qa}
                        onChange={(e) =>
                          updateTaskData(
                            groupIndex,
                            "estimated_hours_qa",
                            e.target.value
                          )
                        }
                        className="w-full p-2 border rounded-md"
                        placeholder="Hours"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h4 className="text-lg font-semibold text-gray-900">
                          Files Configuration
                        </h4>
                        <Badge variant="secondary" className="text-xs">
                          {group.filesData.length} files
                        </Badge>
                      </div>
                      {group.filesData.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <AlertCircle className="w-4 h-4" />
                          Configure each file individually
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4">
                      {group.filesData.map((fileData, fileIndex) => (
                        <Card
                          key={`group-${groupIndex}-filedata-${fileIndex}-${fileData.file_name}`}
                          className="p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200"
                        >
                          {/* File Header */}
                          <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-50 rounded-lg">
                                <FileText className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <h5 className="font-semibold text-gray-900 text-base">
                                  {fileData.file_name}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  File {fileIndex + 1} of{" "}
                                  {group.filesData.length}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={
                                group.filesData[fileIndex].assigned_to.length >
                                  0
                                  ? "default"
                                  : "secondary"
                              }
                              className="flex items-center gap-1"
                            >
                              <User className="w-3 h-3" />
                              {
                                group.filesData[fileIndex].assigned_to.length
                              }{" "}
                              assigned
                            </Badge>
                          </div>

                          {/* File Configuration */}
                          <div className="grid md:grid-cols-2 gap-6">
                            {/* Page Count Section */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-gray-600" />
                                <label className="text-sm font-medium text-gray-700">
                                  Page Count
                                </label>
                              </div>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={
                                    group.filesData[fileIndex]?.page_count || ""
                                  }
                                  onChange={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    updateFileData(
                                      groupIndex,
                                      fileIndex,
                                      "page_count",
                                      e.target.value
                                    );
                                  }}
                                  placeholder="Enter page count"
                                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                  <span className="text-xs text-gray-400">
                                    pages
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Team Assignment Section */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-gray-600" />
                                <label className="text-sm font-medium text-gray-700">
                                  Assign Processors
                                </label>
                              </div>

                              {/* Selected Processors Display */}
                              <div className="min-h-[48px] p-3 border border-gray-200 rounded-lg bg-gray-50">
                                {group.filesData[fileIndex].assigned_to.length >
                                  0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {group.filesData[fileIndex].assigned_to.map(
                                      (assignee, index) => (
                                        <div
                                          key={index}
                                          className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm"
                                        >
                                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                            <span className="text-xs font-medium text-blue-600">
                                              {assignee.name?.charAt(0) ||
                                                assignee.email?.charAt(0) ||
                                                "?"}
                                            </span>
                                          </div>
                                          <span className="text-sm font-medium text-gray-700">
                                            {assignee.name || assignee.email}
                                          </span>
                                        </div>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-sm text-gray-400 italic">
                                      No processors assigned
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Simple Checkbox Selection */}
                              <div className="space-y-2">
                                <p className="text-xs text-gray-600 font-medium">
                                  Select Processors:
                                </p>
                                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                                  {processors && processors.length > 0 ? (
                                    processors.map((processor) => {
                                      const isAssigned = group.filesData[
                                        fileIndex
                                      ].assigned_to.some(
                                        (assignee) =>
                                          assignee.user_id === processor.id
                                      );

                                      return (
                                        <label
                                          key={processor.id}
                                          className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isAssigned}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const isChecked =
                                                e.target.checked;


                                              setFileGroups((prev) => {
                                                const newGroups = [...prev];
                                                const currentAssignees =
                                                  newGroups[groupIndex]
                                                    .filesData[fileIndex]
                                                    .assigned_to;

                                                if (isChecked) {
                                                  // Add processor if not already assigned
                                                  if (
                                                    !currentAssignees.some(
                                                      (a) =>
                                                        a.user_id ===
                                                        processor.id
                                                    )
                                                  ) {
                                                    newGroups[
                                                      groupIndex
                                                    ].filesData[
                                                      fileIndex
                                                    ].assigned_to = [
                                                        ...currentAssignees,
                                                        {
                                                          user_id: processor.id,
                                                          name: processor.name,
                                                          email: processor.email,
                                                          role: processor.role,
                                                          assigned_at:
                                                            new Date().toISOString(),
                                                        },
                                                      ];
                                                  }
                                                } else {
                                                  // Remove processor
                                                  newGroups[
                                                    groupIndex
                                                  ].filesData[
                                                    fileIndex
                                                  ].assigned_to =
                                                    currentAssignees.filter(
                                                      (a) =>
                                                        a.user_id !==
                                                        processor.id
                                                    );
                                                }

                                                return newGroups;
                                              });
                                            }}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                          />
                                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                            <span className="text-sm font-medium text-gray-600">
                                              {processor.name?.charAt(0) ||
                                                processor.email?.charAt(0) ||
                                                "?"}
                                            </span>
                                          </div>
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">
                                              {processor.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              {processor.email}
                                            </p>
                                          </div>
                                        </label>
                                      );
                                    })
                                  ) : (
                                    <div className="text-center py-4 text-gray-400">
                                      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                      <p className="text-sm">
                                        No processors available
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {group.filesData.length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          No files to configure
                        </h3>
                        <p className="text-gray-500">
                          Add files to this task group to configure them.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-between">
          <button
            onClick={handlePrevStep}
            className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors ${currentStep === 1 ? "invisible" : ""
              }`}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>
          <button
            onClick={currentStep === 4 ? handleSubmit : handleNextStep}
            disabled={isSubmitting}
            className="flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
          >
            {currentStep === 4 ? (
              isSubmitting ? (
                "Creating..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  Create Task
                </>
              )
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div >
  );
};

export default TaskModal;
