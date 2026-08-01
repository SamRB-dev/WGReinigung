export type Member = { id: string; display_name: string; email: string; rotation_position: number; is_admin?: boolean };
export type CleaningTask = { id: string; category: string; title: string; guideline: string | null; sort_order: number; completed?: boolean };
export type DashboardData = {
  householdId: string; householdName: string; currentCleaner: Member; nextCleaner: Member; weekId: string; weekStart: string; deadline: string; status: string;
  completedTasks: number; totalTasks: number; nextBioDate: string; bioCompleted: boolean; isAdmin: boolean;
};
