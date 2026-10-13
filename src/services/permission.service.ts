import { env } from "@/config/env.ts";

export class PermissionService {
  is_super_admin(user_jid: string): boolean {
    return env.ADMIN_JIDS.includes(user_jid);
  }

  can_modify_item(params: {
    user_jid: string;
    item_created_by: string;
    is_group_admin: boolean;
  }): boolean {
    if (this.is_super_admin(params.user_jid)) {
      return true;
    }
    if (params.user_jid === params.item_created_by) {
      return true;
    }
    return params.is_group_admin;
  }

  can_manage_settings(params: {
    user_jid: string;
    is_group: boolean;
    is_group_admin: boolean;
  }): boolean {
    if (this.is_super_admin(params.user_jid)) {
      return true;
    }
    if (!params.is_group) {
      return true;
    }
    return params.is_group_admin;
  }

  can_use_bot(params: {
    user_jid: string;
    is_group: boolean;
    is_group_admin: boolean;
    admin_only: boolean;
  }): boolean {
    if (this.is_super_admin(params.user_jid)) {
      return true;
    }
    if (!params.is_group || !params.admin_only) {
      return true;
    }
    return params.is_group_admin;
  }
}
