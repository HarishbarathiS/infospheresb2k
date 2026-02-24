import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

export async function GET() {
    try {
        const supabase = await createClient();

        // Fetch all files with their page counts and upload timestamps
        const { data: filesData, error } = await supabase
            .from('files_test')
            .select('task_id, page_count, uploaded_at');

        if (error) {
            console.error('Error fetching page counts:', error);
            return NextResponse.json({ error: 'Failed to fetch page counts' }, { status: 500 });
        }

        // Map to store latest page count and its timestamp per task_id
        const taskLatestMap: { [key: string]: { pageCount: number | null, uploadedAt: string } } = {};

        (filesData || []).forEach((file: any) => {
            const taskId = file.task_id;
            const currentUploadedAt = file.uploaded_at || new Date(0).toISOString();

            if (!taskLatestMap[taskId] || new Date(currentUploadedAt) > new Date(taskLatestMap[taskId].uploadedAt)) {
                taskLatestMap[taskId] = {
                    pageCount: file.page_count,
                    uploadedAt: currentUploadedAt
                };
            }
        });

        // Convert to result format
        const result = Object.entries(taskLatestMap).map(([task_id, data]) => ({
            task_id,
            total_pages: data.pageCount || 0
        }));

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in page-counts API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
