import type { Clock } from "@/lib/clock.ts";
import type { ChatService } from "@/services/chat.service.ts";
import type { CourseService } from "@/services/course.service.ts";
import type { EventService } from "@/services/event.service.ts";
import type { PermissionService } from "@/services/permission.service.ts";
import type { TaskService } from "@/services/task.service.ts";

export interface ServiceContainer {
  clock: Clock;
  chat_service: ChatService;
  event_service: EventService;
  course_service: CourseService;
  task_service: TaskService;
  permission_service: PermissionService;
}
