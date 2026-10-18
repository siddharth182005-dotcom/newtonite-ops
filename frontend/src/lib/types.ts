export type Status = 'open' | 'in_progress' | 'awaiting_approval' | 'blocked' | 'resolved' | 'closed'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type WorkType = 'incident' | 'customer_issue' | 'payment_investigation' | 'compliance_request' | 'task'
export type Role = 'viewer' | 'member' | 'lead' | 'admin'
export const STATUSES: Status[] = ['open', 'in_progress', 'awaiting_approval', 'blocked', 'resolved', 'closed']
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']
export const TYPES: WorkType[] = ['incident', 'customer_issue', 'payment_investigation', 'compliance_request', 'task']
export const ACTIVE: Status[] = ['open', 'in_progress', 'awaiting_approval', 'blocked']
/** Mirrors backend TRANSITIONS for UI hints only; the server remains the authority. */
export const TRANSITIONS: Record<Status, Status[]> = {
  open: ['in_progress', 'blocked'], in_progress: ['open', 'blocked', 'awaiting_approval'],
  awaiting_approval: ['resolved', 'in_progress'], blocked: ['open', 'in_progress'],
  resolved: ['closed', 'open', 'in_progress'], closed: ['open'],
}
export interface UserBrief { id: number; name: string }
export interface Item {
  id: number; key: string; title: string; description: string; type: WorkType; status: Status; priority: Priority
  team: { id: number; name: string }; creator: UserBrief; assignee: UserBrief | null
  due_date: string | null; version: number; created_at: string; updated_at: string; resolved_at: string | null
}
export interface Me {
  id: number; name: string; email: string; is_admin: boolean; csrf_token: string
  memberships: { team_id: number; team_name: string; role: Role }[]
}
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface Activity {
  id: number; actor: UserBrief; action: string; field: string | null; old_value: string | null
  new_value: string | null; meta: Record<string, any> | null; created_at: string; work_item_id?: number; work_item_key?: string
}
export interface Comment { id: number; author: UserBrief; body: string; created_at: string }
export interface Summary {
  total_active: number; my_assigned: number; critical_high: number; blocked: number; overdue: number
  unassigned_urgent: number; awaiting_my_approval: number
  by_status: Record<string, number>; by_priority: Record<string, number>
  recently_updated: Item[]; recent_activity: Activity[]
}
export interface TeamInfo { id: number; name: string; description: string; member_count: number; my_role: string | null }
