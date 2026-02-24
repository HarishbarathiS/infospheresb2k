import { Calendar, Clock, ChevronDown, Edit2, Loader2, Download } from "lucide-react";
import React from "react";
import { getPriorityBadge } from "./task/priority";
import { getStatusBadge } from "./task/status";
import { useState } from "react";
import { createClient } from "@/lib/client";
import { useEffect } from "react";
import { fetchTaskAssignments } from "@/utils/taskAssignments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "react-toastify";
import { Button } from "./ui/button";

// Updated Task interface to match the one from page.tsx
interface Task {
  // From tasks_test
  task_id: string;
  task_name: string;
  client_instruction: string;
  processor_type: string;
  estimated_hours_ocr: number;
  estimated_hours_qc: number;
  estimated_hours_qa: number;
  completion_status: boolean;
  created_at: string;
  status: string;
  feedback: string;
  file_type: string;
  file_format: string;
  custom_file_format: string;

  // From projects_test
  project_id: string;
  project_name: string;
  po_hours: number;
  mail_instruction: string;
  list_of_files: string[]; // Deprecated - kept for interface compatibility, populated from files_test
  reference_file: string;
  delivery_date: string;
  delivery_time: string;
  language: string;

  // Creator information
  created_by: {
    id: string;
    name: string;
    email: string;
    role: string;
  };

  // Frontend display properties
  title: string; // Maps to task_name
  priority: string; // Maps from processor_type
  dueDate: string; // Maps to delivery_date
  deliveryTime: string; // Maps to delivery_time
  assignedTo: string;
  attachments: string[];
  estimatedHours: number; // Sum of all estimated hours
  overall_completion_status: boolean;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const MainTaskCard = ({
  task,
  status,
  progress,
  onAssignTask: _onAssignTask,
  assignmentRefreshTrigger,
  lastHandoverBy,
  onTaskUpdate,
  currentUser,
}: {
  task: Task;
  status: string;
  progress: number;
  onAssignTask: (_user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) => void;
  assignmentRefreshTrigger?: number;
  lastHandoverBy?: string | null;
  onTaskUpdate?: () => void;
  currentUser?: UserProfile | null;
}) => {
  const [assignedTo, setAssignedTo] = useState<
    {
      user_id: string;
      name: string;
      email: string;
      role: string;
      action_type: string;
    }[]
  >([]);
  const [realStatus, setRealStatus] = useState<string>(status);
  const [statusLoading, _setStatusLoading] = useState(false);

  // Edit State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({
    task_name: task.task_name || task.title || "",
    client_instruction: task.client_instruction || "",
    mail_instruction: task.mail_instruction || "",
    po_hours: task.po_hours || 0,
    file_type: task.file_type || "",
    file_format: task.file_format || "",
    custom_file_format: task.custom_file_format || "",
    estimated_hours_ocr: task.estimated_hours_ocr || 0,
    estimated_hours_qc: task.estimated_hours_qc || 0,
    estimated_hours_qa: task.estimated_hours_qa || 0,
    delivery_date: task.delivery_date || task.dueDate || "",
    delivery_time: task.delivery_time || task.deliveryTime || "",
  });

  const supabase = createClient();

  const fetchAssignedTo = async () => {
    const assignments = await fetchTaskAssignments(task.task_id, task.created_by?.id);
    setAssignedTo(assignments);
  };

  useEffect(() => {
    fetchAssignedTo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.task_id, assignmentRefreshTrigger]);

  // Sync realStatus with status prop when it changes
  useEffect(() => {
    setRealStatus(status);
  }, [status]);

  // Sync editData with task prop when it changes
  useEffect(() => {
    setEditData({
      task_name: task.task_name || task.title || "",
      client_instruction: task.client_instruction || "",
      mail_instruction: task.mail_instruction || "",
      po_hours: task.po_hours || 0,
      file_type: task.file_type || "",
      file_format: task.file_format || "",
      custom_file_format: task.custom_file_format || "",
      estimated_hours_ocr: task.estimated_hours_ocr || 0,
      estimated_hours_qc: task.estimated_hours_qc || 0,
      estimated_hours_qa: task.estimated_hours_qa || 0,
      delivery_date: task.delivery_date || task.dueDate || "",
      delivery_time: task.delivery_time || task.deliveryTime || "",
    });
  }, [task]);

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/tasks/${task.task_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          data: editData
        })
      });

      if (response.ok) {
        toast.success("Task updated successfully");
        setIsEditDialogOpen(false);
        if (onTaskUpdate) {
          onTaskUpdate();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update task");
      }
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not set";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Check if task is due today
  const isDueToday = () => {
    const dueDate = task.delivery_date || task.dueDate;
    if (!dueDate) return false;
    try {
      const today = new Date();
      const taskDue = new Date(dueDate);

      // Set both dates to start of day for comparison
      today.setHours(0, 0, 0, 0);
      taskDue.setHours(0, 0, 0, 0);

      return today.getTime() === taskDue.getTime();
    } catch {
      return false;
    }
  };

  const isTaskDueToday = isDueToday();

  // Format time helper
  const formatTime = (timeString: string) => {
    if (!timeString) return "Not set";
    try {
      let timeStr;
      // Handle different time formats
      if (timeString.includes("T")) {
        // Full datetime format (2023-01-01T14:30:00)
        timeStr = timeString.substring(11, 16);
      } else if (timeString.includes(":")) {
        // Time only format (14:30:00 or 14:30)
        timeStr = timeString.substring(0, 5);
      } else {
        return timeString;
      }

      const [hours, minutes] = timeStr.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return timeString;
    }
  };

  const handleDownloadReference = async (fileName: string, storagePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("project-references")
        .download(storagePath);

      if (error) throw error;
      if (!data) throw new Error("No file data found");

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Reference file downloaded");
    } catch (error) {
      console.error("Error downloading reference file:", error);
      toast.error("Failed to download reference file");
    }
  };

  return (
    <>
      <div className="p-6 pb-4 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {task.task_name || task.title}
            </h1>
            <p className="mt-1 text-gray-500">Project: {task.project_name}</p>
            <p className="mt-1 text-gray-500">
              Created on {formatDate(task.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentUser?.role === 'projectManager' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                className="h-8 px-2 text-slate-600 hover:text-slate-900"
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Edit Details
              </Button>
            )}
            {statusLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            ) : (
              getStatusBadge(realStatus)
            )}
            {getPriorityBadge(task.priority || task.processor_type || "normal")}
          </div>
        </div>
      </div>

      {/* Handover Notice Banner */}
      {assignedTo.length === 0 && lastHandoverBy && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                This task was handed over by <span className="font-semibold">{lastHandoverBy}</span>
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Task is currently unassigned and available for pickup or reassignment
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 pb-6">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-500">Progress</span>
            <span className="text-sm font-medium text-gray-900">
              {progress}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                Client Instructions
              </h3>
              <p className="text-gray-900">
                {task.client_instruction || "No client instructions provided"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                Mail Instructions
              </h3>
              <p className="text-gray-900">
                {task.mail_instruction || "No mail instructions provided"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                PO Hours
              </h3>
              <p className="text-gray-900">{task.po_hours || 0} hours</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                Language
              </h3>
              <p className="text-gray-900 capitalize">
                {task.language || "Not specified"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                File Type
              </h3>
              <p className="text-gray-900 capitalize">
                {task.file_type || "Not specified"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                File Format
              </h3>
              <p className="text-gray-900">
                {task.file_format
                  ? task.file_format === "ms_excel"
                    ? "MS Excel"
                    : task.file_format === "ms_word"
                      ? "MS Word"
                      : task.file_format === "indesign"
                        ? "InDesign"
                        : task.file_format === "photoshop"
                          ? "Photoshop"
                          : task.file_format === "powerpoint"
                            ? "PowerPoint"
                            : task.file_format === "illustrator"
                              ? "Illustrator"
                              : task.file_format === "others"
                                ? task.custom_file_format || "Others (not specified)"
                                : task.file_format
                  : "Not specified"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Assigned To
                </h3>
                <div className="flex flex-col gap-1.5 py-1">
                  {assignedTo.length === 0 ? (
                    <div className="flex flex-col gap-1">
                      <div className="text-sm text-gray-400 font-medium italic">
                        Unassigned
                      </div>
                      {lastHandoverBy && (
                        <div className="text-xs text-blue-600 font-medium">
                          Handed over by {lastHandoverBy}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="flex -space-x-2 mr-1">
                        {assignedTo.slice(0, 3).map((user, index) => (
                          <div
                            key={index}
                            className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center ring-2 ring-white"
                            title={user.name}
                          >
                            <span className="text-[10px] text-gray-600 font-bold">
                              {user.name?.charAt(0) || "?"}
                            </span>
                          </div>
                        ))}
                        {assignedTo.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
                            <span className="text-[10px] font-bold text-gray-600">
                              +{assignedTo.length - 3}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {assignedTo.map(u => u.name).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Created By
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                    <span className="text-xs text-gray-600">
                      {task.created_by?.name?.charAt(0) || "?"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-900">
                      {task.created_by?.name || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {task.created_by?.role || ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Est. Hours (OCR)
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-900">
                    {task.estimated_hours_ocr || 0}h
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Est. Hours (QC)
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-900">
                    {task.estimated_hours_qc || 0}h
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Est. Hours (QA)
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-900">
                    {task.estimated_hours_qa || 0}h
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Due Date
                </h3>
                <div className="flex items-center gap-2">
                  <Calendar className={`h-4 w-4 ${isTaskDueToday ? "text-orange-500" : "text-gray-500"}`} />
                  <div className="flex flex-col gap-1">
                    <span className={`text-gray-900 ${isTaskDueToday ? "font-semibold text-orange-600" : ""}`}>
                      {formatDate(task.delivery_date || task.dueDate)}
                    </span>
                    {isTaskDueToday && (
                      <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
                        DUE TODAY!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Due Time
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-900">
                    {formatTime(task.delivery_time || task.deliveryTime)}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Total Est. Hours
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-900">
                    {task.estimatedHours ||
                      (task.estimated_hours_ocr || 0) +
                      (task.estimated_hours_qc || 0) +
                      (task.estimated_hours_qa || 0)}
                    h
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Overall Status
                </h3>
                <p className="text-gray-900">
                  {task.overall_completion_status ? "Completed" : "Pending"}
                </p>
              </div>
            </div>

            {task.reference_file && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Reference File
                </h3>
                {task.reference_file.includes('|') ? (
                  (() => {
                    const [fileName, storagePath] = task.reference_file.split('|');
                    return (
                      <button
                        onClick={() => handleDownloadReference(fileName, storagePath)}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{fileName}</span>
                      </button>
                    );
                  })()
                ) : (
                  <p className="text-gray-900">{task.reference_file}</p>
                )}
              </div>
            )}

            {task.feedback && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Feedback
                </h3>
                <p className="text-gray-900">{task.feedback}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task Details</DialogTitle>
            <DialogDescription>
              Make changes to task information here. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Task Name</label>
                <Input
                  value={editData.task_name}
                  onChange={(e) => setEditData({ ...editData, task_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">File Type</label>
                <Select
                  value={editData.file_type}
                  onValueChange={(val) => setEditData({ ...editData, file_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select file type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editable">Editable</SelectItem>
                    <SelectItem value="non_editable">Non-Editable</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">File Format</label>
                <Select
                  value={editData.file_format}
                  onValueChange={(val) => setEditData({ ...editData, file_format: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select file format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ms_excel">MS Excel</SelectItem>
                    <SelectItem value="ms_word">MS Word</SelectItem>
                    <SelectItem value="indesign">InDesign</SelectItem>
                    <SelectItem value="photoshop">Photoshop</SelectItem>
                    <SelectItem value="powerpoint">PowerPoint</SelectItem>
                    <SelectItem value="illustrator">Illustrator</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editData.file_format === 'others' && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Specify Format</label>
                  <Input
                    value={editData.custom_file_format}
                    onChange={(e) => setEditData({ ...editData, custom_file_format: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Due Date</label>
                <Input
                  type="date"
                  value={editData.delivery_date ? (editData.delivery_date.includes('T') ? editData.delivery_date.split('T')[0] : editData.delivery_date) : ""}
                  onChange={(e) => setEditData({ ...editData, delivery_date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Due Time</label>
                <Input
                  type="time"
                  value={editData.delivery_time ? (editData.delivery_time.length > 5 ? editData.delivery_time.substring(0, 5) : editData.delivery_time) : ""}
                  onChange={(e) => setEditData({ ...editData, delivery_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">PO Hours</label>
                <Input
                  type="number"
                  value={editData.po_hours}
                  onChange={(e) => setEditData({ ...editData, po_hours: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2 col-span-2">
                <label className="text-sm font-medium italic text-slate-400">Estimated Hours</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <span className="text-[10px] uppercase text-slate-500 font-bold">OCR</span>
                    <Input
                      type="number"
                      value={editData.estimated_hours_ocr}
                      onChange={(e) => setEditData({ ...editData, estimated_hours_ocr: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[10px] uppercase text-slate-500 font-bold">QC</span>
                    <Input
                      type="number"
                      value={editData.estimated_hours_qc}
                      onChange={(e) => setEditData({ ...editData, estimated_hours_qc: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[10px] uppercase text-slate-500 font-bold">QA</span>
                    <Input
                      type="number"
                      value={editData.estimated_hours_qa}
                      onChange={(e) => setEditData({ ...editData, estimated_hours_qa: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Client Instructions</label>
              <Textarea
                value={editData.client_instruction}
                onChange={(e) => setEditData({ ...editData, client_instruction: e.target.value })}
                className="min-h-[80px]"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Mail Instructions</label>
              <Textarea
                value={editData.mail_instruction}
                onChange={(e) => setEditData({ ...editData, mail_instruction: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
