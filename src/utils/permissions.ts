/**
 * Role-Based Access Control (RBAC) Utilities
 */

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  VALIDATOR = 'validator',
  SUPPORT = 'support',
  VIEWER = 'viewer',
}

export enum Permission {
  // User Management
  VIEW_USERS = 'view_users',
  CREATE_USERS = 'create_users',
  UPDATE_USERS = 'update_users',
  DELETE_USERS = 'delete_users',
  ASSIGN_ROLES = 'assign_roles',

  // Shipments
  VIEW_SHIPMENTS = 'view_shipments',
  CREATE_SHIPMENTS = 'create_shipments',
  UPDATE_SHIPMENTS = 'update_shipments',
  DELETE_SHIPMENTS = 'delete_shipments',
  APPROVE_SHIPMENTS = 'approve_shipments',
  EXPORT_SHIPMENTS = 'export_shipments',

  // Communications
  VIEW_THREADS = 'view_threads',
  CREATE_THREADS = 'create_threads',
  SEND_MESSAGES = 'send_messages',
  ASSIGN_THREADS = 'assign_threads',
  CLOSE_THREADS = 'close_threads',
  DELETE_THREADS = 'delete_threads',
  ARCHIVE_THREADS = 'archive_threads',

  // Customers
  VIEW_CUSTOMERS = 'view_customers',
  CREATE_CUSTOMERS = 'create_customers',
  UPDATE_CUSTOMERS = 'update_customers',
  DELETE_CUSTOMERS = 'delete_customers',
  EXPORT_CUSTOMERS = 'export_customers',

  // Analytics
  VIEW_ANALYTICS = 'view_analytics',
  VIEW_REPORTS = 'view_reports',
  EXPORT_REPORTS = 'export_reports',
  VIEW_SYSTEM_METRICS = 'view_system_metrics',

  // Workflows
  VIEW_WORKFLOWS = 'view_workflows',
  CREATE_WORKFLOWS = 'create_workflows',
  UPDATE_WORKFLOWS = 'update_workflows',
  DELETE_WORKFLOWS = 'delete_workflows',
  EXECUTE_WORKFLOWS = 'execute_workflows',

  // Documents
  VIEW_DOCUMENTS = 'view_documents',
  UPLOAD_DOCUMENTS = 'upload_documents',
  DELETE_DOCUMENTS = 'delete_documents',

  // Settings
  VIEW_SETTINGS = 'view_settings',
  UPDATE_SETTINGS = 'update_settings',
  MANAGE_INTEGRATIONS = 'manage_integrations',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
}

/**
 * Role hierarchy - higher number = more permissions
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.VIEWER]: 1,
  [UserRole.SUPPORT]: 2,
  [UserRole.VALIDATOR]: 3,
  [UserRole.MANAGER]: 4,
  [UserRole.ADMIN]: 5,
};

/**
 * Permission matrix - defines which roles have which permissions
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Admin has ALL permissions
    ...Object.values(Permission),
  ],

  [UserRole.MANAGER]: [
    // User Management
    Permission.VIEW_USERS,

    // Shipments
    Permission.VIEW_SHIPMENTS,
    Permission.CREATE_SHIPMENTS,
    Permission.UPDATE_SHIPMENTS,
    Permission.DELETE_SHIPMENTS,
    Permission.APPROVE_SHIPMENTS,
    Permission.EXPORT_SHIPMENTS,

    // Communications
    Permission.VIEW_THREADS,
    Permission.CREATE_THREADS,
    Permission.SEND_MESSAGES,
    Permission.ASSIGN_THREADS,
    Permission.CLOSE_THREADS,
    Permission.DELETE_THREADS,
    Permission.ARCHIVE_THREADS,

    // Customers
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMERS,
    Permission.UPDATE_CUSTOMERS,
    Permission.DELETE_CUSTOMERS,
    Permission.EXPORT_CUSTOMERS,

    // Analytics
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_REPORTS,
    Permission.EXPORT_REPORTS,

    // Workflows
    Permission.VIEW_WORKFLOWS,
    Permission.CREATE_WORKFLOWS,
    Permission.UPDATE_WORKFLOWS,
    Permission.DELETE_WORKFLOWS,
    Permission.EXECUTE_WORKFLOWS,

    // Documents
    Permission.VIEW_DOCUMENTS,
    Permission.UPLOAD_DOCUMENTS,
    Permission.DELETE_DOCUMENTS,

    // Settings
    Permission.VIEW_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
  ],

  [UserRole.VALIDATOR]: [
    // Shipments
    Permission.VIEW_SHIPMENTS,
    Permission.CREATE_SHIPMENTS,
    Permission.UPDATE_SHIPMENTS,
    Permission.APPROVE_SHIPMENTS,
    Permission.EXPORT_SHIPMENTS,

    // Communications
    Permission.VIEW_THREADS,
    Permission.CREATE_THREADS,
    Permission.SEND_MESSAGES,
    Permission.CLOSE_THREADS,
    Permission.ARCHIVE_THREADS,

    // Customers
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMERS,
    Permission.UPDATE_CUSTOMERS,

    // Analytics
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_REPORTS,

    // Workflows
    Permission.VIEW_WORKFLOWS,
    Permission.EXECUTE_WORKFLOWS,

    // Documents
    Permission.VIEW_DOCUMENTS,
    Permission.UPLOAD_DOCUMENTS,
    Permission.DELETE_DOCUMENTS,
  ],

  [UserRole.SUPPORT]: [
    // Shipments
    Permission.VIEW_SHIPMENTS,
    Permission.CREATE_SHIPMENTS,
    Permission.EXPORT_SHIPMENTS,

    // Communications
    Permission.VIEW_THREADS,
    Permission.CREATE_THREADS,
    Permission.SEND_MESSAGES,
    Permission.CLOSE_THREADS,
    Permission.ARCHIVE_THREADS,

    // Customers
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMERS,
    Permission.UPDATE_CUSTOMERS,

    // Workflows
    Permission.VIEW_WORKFLOWS,
    Permission.EXECUTE_WORKFLOWS,

    // Documents
    Permission.VIEW_DOCUMENTS,
    Permission.UPLOAD_DOCUMENTS,
  ],

  [UserRole.VIEWER]: [
    // View-only permissions
    Permission.VIEW_SHIPMENTS,
    Permission.VIEW_THREADS,
    Permission.VIEW_CUSTOMERS,
    Permission.VIEW_WORKFLOWS,
    Permission.VIEW_DOCUMENTS,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const userRole = role as UserRole;
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

/**
 * Check if a role is at least a certain level
 */
export function hasMinRole(role: string, minRole: UserRole): boolean {
  const userRoleLevel = ROLE_HIERARCHY[role as UserRole] || 0;
  const minRoleLevel = ROLE_HIERARCHY[minRole];
  return userRoleLevel >= minRoleLevel;
}

/**
 * Check if a role is in a list of allowed roles
 */
export function hasRole(role: string, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role as UserRole);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as UserRole] || [];
}

/**
 * Check if user can perform action on resource based on ownership
 */
export function canAccessResource(
  userRole: string,
  userId: string,
  resourceOwnerId: string | null,
  requiredPermission: Permission
): boolean {
  // Admins can access everything
  if (userRole === UserRole.ADMIN) {
    return true;
  }

  // User can access their own resources
  if (userId === resourceOwnerId) {
    return true;
  }

  // Check if role has the required permission
  return hasPermission(userRole, requiredPermission);
}
