// Utility function to fetch assigned users for a task, filtered by current stage
import { createClient } from '@/lib/client';
import { getTaskActions } from './taskActions';

export interface AssignedUser {
    user_id: string;
    name: string;
    email: string;
    role: string;
    action_type: string;
}

/**
 * Fetches assigned users for a specific task, filtered by current stage
 * Uses the same logic as MainTaskCard.tsx
 */
export async function fetchTaskAssignments(
    taskId: string,
    creatorId?: string
): Promise<AssignedUser[]> {
    try {
        const supabase = createClient();

        // Get task creator ID to filter them out
        const { data: taskData, error: taskError } = await supabase
            .from("tasks_test")
            .select("created_by")
            .eq("task_id", taskId)
            .single();

        const taskCreatorId = taskData?.created_by || null;

        if (taskError) {
            console.error(`[${taskId}] Error fetching task creator:`, taskError);
        }

        // First, get the current stage from task_iterations
        const { data: iteration, error: iterationError } = await supabase
            .from("task_iterations")
            .select("current_stage")
            .eq("task_id", taskId)
            .single();

        const currentStage = iteration?.current_stage || null;

        if (iterationError && iterationError.code !== "PGRST116") {
            console.error("Error fetching current stage:", iterationError);
        }

        // Fetch from task_actions table for 'taken_by' and 'assigned_to' actions
        const actionsResult = await getTaskActions({
            task_id: taskId,
            action_type: ["taken_by", "assigned_to"],
        });

        let taskActionsUsers: {
            user_id: string;
            name: string;
            email: string;
            role: string;
            action_type: string;
            assigned_at: string;
            stage: string;
            source: string;
        }[] = [];

        if (actionsResult.success && actionsResult.data) {
            // Process task actions to get assigned users
            taskActionsUsers = actionsResult.data
                .filter((action: any) => action.user_id !== taskCreatorId && action.action_type !== "handover") // Filter out creator and handovers
                .map(
                    (action: {
                        user_id: string;
                        action_type: string;
                        created_at: string;
                        metadata?: {
                            user_name?: string;
                            user_email?: string;
                            user_role?: string;
                            stage?: string;
                            assignment_stage?: string;
                            assigned_to_user_id?: string;
                            assigned_to_user_name?: string;
                            assigned_to_user_email?: string;
                            assigned_to_user_role?: string;
                        };
                    }) => {
                        const isAssignedToAction = action.action_type === "assigned_to";
                        const actualUserId = isAssignedToAction
                            ? (action.metadata?.assigned_to_user_id || action.user_id)
                            : action.user_id;

                        // Extract stage from metadata
                        const assignmentStage = isAssignedToAction
                            ? (action.metadata?.assignment_stage || "")
                            : (action.metadata?.stage || "");

                        return {
                            user_id: actualUserId,
                            name: isAssignedToAction
                                ? (action.metadata?.assigned_to_user_name || action.metadata?.user_name || action.user_id)
                                : (action.metadata?.user_name || action.user_id),
                            email: isAssignedToAction
                                ? (action.metadata?.assigned_to_user_email || action.metadata?.user_email || "")
                                : (action.metadata?.user_email || ""),
                            role: isAssignedToAction
                                ? (action.metadata?.assigned_to_user_role || action.metadata?.user_role || "")
                                : (action.metadata?.user_role || ""),
                            action_type: action.action_type,
                            assigned_at: action.created_at,
                            stage: assignmentStage,
                            source: "task_actions",
                        };
                    }
                );

            // Filter by current stage if available (case-insensitive)
            if (currentStage) {
                taskActionsUsers = taskActionsUsers.filter(
                    (user) => !user.stage || user.stage.toLowerCase() === currentStage.toLowerCase()
                );
            }
        }

        // Fetch from files_test table
        const { data: filesData, error: filesError } = await supabase
            .from("files_test")
            .select("taken_by, assigned_to, created_at")
            .eq("task_id", taskId);

        const filesUsers: {
            user_id: string;
            name: string;
            email: string;
            role: string;
            action_type: string;
            assigned_at: string;
            stage: string;
            source: string;
        }[] = [];

        if (!filesError && filesData) {
            // Process files_test data
            filesData.forEach(
                (file: {
                    taken_by?: string;
                    assigned_to?: {
                        user_id?: string;
                        id?: string;
                        name?: string;
                        email?: string;
                        role?: string;
                        assigned_at?: string;
                    }[];
                    created_at: string;
                }) => {
                    // Process taken_by field
                    if (file.taken_by && file.taken_by !== taskCreatorId) {
                        // For taken_by in files table, we usually don't have stage info,
                        // but if we are in a stage where people take files, it applies.
                        filesUsers.push({
                            user_id: file.taken_by,
                            name: file.taken_by,
                            email: "",
                            role: "",
                            action_type: "taken_by",
                            assigned_at: file.created_at,
                            stage: "",
                            source: "files_test",
                        });
                    }

                    // Process assigned_to array
                    if (file.assigned_to && Array.isArray(file.assigned_to)) {
                        file.assigned_to.forEach(
                            (assignment: {
                                user_id?: string;
                                id?: string;
                                name?: string;
                                email?: string;
                                role?: string;
                                assigned_at?: string;
                            }) => {
                                if (assignment && typeof assignment === "object") {
                                    const userId = assignment.user_id || assignment.id || "unknown";

                                    // Skip the creator
                                    if (userId === taskCreatorId) return;

                                    // Filter by current stage (match role to stage, case-insensitive)
                                    if (currentStage && assignment.role &&
                                        assignment.role.toLowerCase() !== currentStage.toLowerCase()) {
                                        return;
                                    }

                                    filesUsers.push({
                                        user_id: userId,
                                        name:
                                            assignment.name ||
                                            assignment.user_id ||
                                            assignment.id ||
                                            "unknown",
                                        email: assignment.email || "",
                                        role: assignment.role || "",
                                        action_type: "assigned_to",
                                        assigned_at: assignment.assigned_at || file.created_at,
                                        stage: assignment.role || "",
                                        source: "files_test",
                                    });
                                }
                            }
                        );
                    }
                }
            );
        }

        // Combine both sources
        let allUsers = [...taskActionsUsers, ...filesUsers];

        // Fetch transitions (handover and send_to) to check for reset points
        const transitionsResult = await getTaskActions({
            task_id: taskId,
            action_type: ["handover", "send_to"],
        });

        let latestTransitionTime = new Date(0);
        if (transitionsResult.success && transitionsResult.data && transitionsResult.data.length > 0) {
            // Data is sorted by created_at desc by getTaskActions usually
            const latestTransition = transitionsResult.data[0];
            latestTransitionTime = new Date(latestTransition.created_at);
        }

        // Filter to only keep assignments that happened AFTER the latest transition
        allUsers = allUsers.filter(u => new Date(u.assigned_at) > latestTransitionTime);

        // Remove duplicates based on user_id and keep the latest action
        const uniqueAssignedUsers = allUsers.reduce(
            (acc: any[], current: any) => {
                const existingIndex = acc.findIndex(
                    (user) => user.user_id === current.user_id
                );
                if (existingIndex === -1) {
                    acc.push(current);
                } else if (new Date(current.assigned_at) > new Date(acc[existingIndex].assigned_at)) {
                    acc[existingIndex] = current;
                }
                return acc;
            },
            []
        );

        // Resolve names from profiles if missing
        const usersWithResolvedNames = await Promise.all(
            uniqueAssignedUsers.map(async (user) => {
                if (!user.name || user.name === user.user_id) {
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("name, email, role")
                        .eq("id", user.user_id)
                        .single();

                    if (profile) {
                        return {
                            ...user,
                            name: profile.name || user.name,
                            email: profile.email || user.email,
                            role: profile.role || user.role,
                        };
                    }
                }
                return user;
            })
        );

        // Final filter to ensure we don't have the creator or current user if passed
        let finalUsers = usersWithResolvedNames.filter(
            (user) => user.user_id !== taskCreatorId && user.user_id !== creatorId
        );

        // Sort by assigned_at desc
        finalUsers.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());

        // For the task page, we might want to see the active set. 
        // If there's multiple, they should all be in the current stage.
        // However, the user said "working on column fine... inside assigned to section... not updated properly".
        // Usually, only one person is "actively" working in a stage. 
        // To be safe and consistent with dashboard, let's keep only the latest one.
        if (finalUsers.length > 1) {
            finalUsers = [finalUsers[0]];
        }

        return finalUsers.map((user) => ({
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            action_type: user.action_type,
        }));
    } catch (error) {
        console.error("Error fetching task assignments:", error);
        return [];
    }
}

/**
 * Batch fetch assigned users for multiple tasks
 * Uses optimized batch endpoint instead of individual calls
 */
export async function fetchBatchTaskAssignments(
    taskIds: string[]
): Promise<Record<string, AssignedUser[]>> {
    try {
        // Use the batch endpoint for efficiency
        const response = await fetch('/api/batch-task-assignments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ taskIds }),
        });

        if (!response.ok) {
            console.error('Batch task assignments request failed:', response.statusText);
            return {};
        }

        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Error in fetchBatchTaskAssignments:', error);
        return {};
    }
}
