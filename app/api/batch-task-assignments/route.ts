import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/server';
import { requireAuth } from '@/app/api/middleware/auth';

/**
 * Batch endpoint to fetch task assignments for multiple tasks in a single request
 * This replaces 50+ individual API calls with 1 optimized batch call
 */
export async function POST(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const { taskIds } = await request.json();

        // Return empty results if no taskIds provided
        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return NextResponse.json({});
        }

        const supabase = await createClient();

        // 1. Fetch task creators (to filter them out from assignments)
        const { data: tasksData, error: taskError } = await supabase
            .from('tasks_test')
            .select('task_id, created_by')
            .in('task_id', taskIds);

        if (taskError) {
            console.error('Error fetching task creators:', taskError);
            throw taskError;
        }

        // Map task_id -> creator_id (handle both string and object formats)
        const creatorsMap = new Map<string, string>();
        tasksData?.forEach(t => {
            if (t.created_by) {
                // created_by might be string ID or object {id, name, ...}
                const creatorId = typeof t.created_by === 'string'
                    ? t.created_by
                    : t.created_by?.id || t.created_by;
                creatorsMap.set(t.task_id, creatorId);
            }
        });

        // 2. Fetch current stage from task_iterations
        const { data: iterationsData, error: iterationsError } = await supabase
            .from('task_iterations')
            .select('task_id, current_stage')
            .in('task_id', taskIds);

        if (iterationsError) {
            console.error('Error fetching current stages:', iterationsError);
        }

        const stageMap = new Map<string, string>();
        iterationsData?.forEach(i => stageMap.set(i.task_id, i.current_stage || 'Processor'));

        // 3. Fetch all relevant task actions (assigned_to, taken_by, handover, AND send_to)
        const { data: actions, error: actionsError } = await supabase
            .from('task_actions')
            .select('*')
            .in('task_id', taskIds)
            .in('action_type', ['assigned_to', 'taken_by', 'handover', 'send_to'])
            .order('created_at', { ascending: false });

        if (actionsError) {
            console.error('Error fetching task actions:', actionsError);
            throw actionsError;
        }

        // 4. Collect all unique user IDs that need profile resolution
        const userIds = new Set<string>();
        actions?.forEach(action => {
            if (action.action_type === 'handover' || action.action_type === 'send_to') return;

            const isAssignedTo = action.action_type === 'assigned_to';
            const userId = isAssignedTo
                ? (action.metadata?.assigned_to_user_id || action.user_id)
                : action.user_id;
            if (userId) userIds.add(userId);
        });

        // 5. Fetch user profiles for name/email/role resolution
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .in('id', Array.from(userIds));

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
        }

        const profilesMap = new Map();
        profiles?.forEach(p => profilesMap.set(p.id, p));

        // 6. Group and process actions by task
        const results: Record<string, any[]> = {};

        // Group actions by task_id
        const taskActionsMap = new Map<string, any[]>();
        actions?.forEach(action => {
            if (!taskActionsMap.has(action.task_id)) {
                taskActionsMap.set(action.task_id, []);
            }
            taskActionsMap.get(action.task_id)?.push(action);
        });

        // Process each task
        taskIds.forEach(taskId => {
            const taskActions = taskActionsMap.get(taskId) || [];
            const creatorId = creatorsMap.get(taskId);
            const currentStage = stageMap.get(taskId) || 'Processor';

            // Find the latest transition timestamp (handover or send_to)
            const latestTransitionAction = taskActions.find(a =>
                a.action_type === 'handover' || a.action_type === 'send_to'
            );
            const latestTransitionTime = latestTransitionAction ? new Date(latestTransitionAction.created_at) : new Date(0);

            // Convert and filter actions to user objects
            const users = taskActions
                .filter(action => action.action_type === 'assigned_to' || action.action_type === 'taken_by')
                .map(action => {
                    const isAssignedTo = action.action_type === 'assigned_to';
                    const userId = isAssignedTo
                        ? (action.metadata?.assigned_to_user_id || action.user_id)
                        : action.user_id;

                    const profile = profilesMap.get(userId);

                    // Get the stage this assignment happened for
                    const assignmentStage = isAssignedTo
                        ? (action.metadata?.assignment_stage || '')
                        : (action.metadata?.stage || '');

                    return {
                        user_id: userId,
                        name: profile?.name || action.metadata?.assigned_to_user_name || action.metadata?.user_name || userId,
                        email: profile?.email || action.metadata?.assigned_to_user_email || action.metadata?.user_email || '',
                        role: profile?.role || action.metadata?.assigned_to_user_role || action.metadata?.user_role || '',
                        action_type: action.action_type,
                        assigned_at: action.created_at,
                        stage: assignmentStage
                    };
                });

            // Filter by:
            // 1. Not the task creator
            // 2. Matches the current task stage
            // 3. Happened AFTER the latest transition (handover or send_to)
            const filtered = users.filter(u => {
                const isNotCreator = u.user_id !== creatorId;
                const matchesStage = !u.stage || u.stage.toLowerCase() === currentStage.toLowerCase();
                const afterTransition = new Date(u.assigned_at) > latestTransitionTime;

                return isNotCreator && matchesStage && afterTransition;
            });

            // Keep only the most recent assignment
            if (filtered.length > 0) {
                results[taskId] = [filtered[0]];
            } else {
                results[taskId] = [];
            }
        });

        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Batch task assignments error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch batch task assignments', details: error.message },
            { status: 500 }
        );
    }
}
