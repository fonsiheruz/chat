import { parseMarkdown, toPlainText } from "./markdown";
import type {
  Adapter,
  AddTaskOptions,
  CompletePlanOptions,
  PlanContent,
  PlanMessage,
  PlanModel,
  PlanModelTask,
  PlanTask,
  StartPlanOptions,
  UpdateTaskInput,
} from "./types";

/**
 * Convert PlanContent to plain text for titles/labels.
 */
export function contentToPlainText(content: PlanContent | undefined): string {
  if (!content) {
    return "";
  }
  if (Array.isArray(content)) {
    return content.join(" ").trim();
  }
  if (typeof content === "string") {
    return content;
  }
  if ("markdown" in content) {
    return toPlainText(parseMarkdown(content.markdown));
  }
  if ("ast" in content) {
    return toPlainText(content.ast);
  }
  return "";
}

const PLAN_TYPE = Symbol.for("chat.plan");
export function isPlan(value: unknown): value is Plan {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Plan).$$typeof === PLAN_TYPE
  );
}

interface BoundState {
  adapter: Adapter;
  messageId: string;
  threadId: string;
  threadIdForEdits: string;
  updateChain: Promise<void>;
}

/**
 * A Plan represents a task list that can be posted to a thread.
 *
 * Create a plan with `Plan({ initialMessage: "..." })` and post it with `thread.post(plan)`.
 * After posting, use methods like `addTask()`, `updateTask()`, and `complete()` to update it.
 *
 * @example
 * ```typescript
 * const plan = Plan({ initialMessage: "Starting task..." });
 * await thread.post(plan);
 * await plan.addTask({ title: "Fetch data" });
 * await plan.updateTask("Got 42 results");
 * await plan.complete({ completeMessage: "Done!" });
 * ```
 */
export class Plan implements PlanMessage {
  readonly $$typeof = PLAN_TYPE;

  private _plan: PlanModel;
  private _bound: BoundState | null = null;

  constructor(options: StartPlanOptions) {
    const title = contentToPlainText(options.initialMessage) || "Plan";
    const firstTask: PlanModelTask = {
      id: crypto.randomUUID(),
      title,
      status: "in_progress",
    };
    this._plan = { title, tasks: [firstTask] };
  }

  get id(): string {
    return this._bound?.messageId ?? "";
  }
  get threadId(): string {
    return this._bound?.threadId ?? "";
  }

  _bind(
    adapter: Adapter,
    threadId: string,
    messageId: string,
    threadIdForEdits: string
  ): void {
    this._bound = {
      adapter,
      messageId,
      threadId,
      threadIdForEdits,
      updateChain: Promise.resolve(),
    };
  }
  _toModel(): PlanModel {
    return this._plan;
  }
  _isSupported(): boolean {
    return !!(this._bound?.adapter.postPlan && this._bound?.adapter.editPlan);
  }

  title(): string {
    return this._plan.title;
  }

  tasks(): PlanTask[] {
    return this._plan.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    }));
  }

  currentTask(): PlanTask | null {
    const current =
      [...this._plan.tasks].reverse().find((t) => t.status === "in_progress") ??
      this._plan.tasks.at(-1);
    if (!current) {
      return null;
    }
    return { id: current.id, title: current.title, status: current.status };
  }

  async reset(options: StartPlanOptions): Promise<PlanTask | null> {
    if (!(this._bound && this._isSupported())) {
      return null;
    }

    const title = contentToPlainText(options.initialMessage) || "Plan";
    const firstTask: PlanModelTask = {
      id: crypto.randomUUID(),
      title,
      status: "in_progress",
    };
    this._plan = { title, tasks: [firstTask] };
    await this.enqueueEdit();
    return {
      id: firstTask.id,
      title: firstTask.title,
      status: firstTask.status,
    };
  }

  async addTask(options: AddTaskOptions): Promise<PlanTask | null> {
    if (!(this._bound && this._isSupported())) {
      return null;
    }
    const title = contentToPlainText(options.title) || "Task";
    for (const task of this._plan.tasks) {
      if (task.status === "in_progress") {
        task.status = "complete";
      }
    }
    const nextTask: PlanModelTask = {
      id: crypto.randomUUID(),
      title,
      status: "in_progress",
      details: options.children,
    };
    this._plan.tasks.push(nextTask);
    this._plan.title = title;

    await this.enqueueEdit();
    return { id: nextTask.id, title: nextTask.title, status: nextTask.status };
  }

  async updateTask(update?: UpdateTaskInput): Promise<PlanTask | null> {
    if (!(this._bound && this._isSupported())) {
      return null;
    }
    const current =
      [...this._plan.tasks].reverse().find((t) => t.status === "in_progress") ??
      this._plan.tasks.at(-1);

    if (!current) {
      return null;
    }
    if (update !== undefined) {
      if (typeof update === "object" && update !== null && "output" in update) {
        if (update.output !== undefined) {
          current.output = update.output;
        }
        if (update.status) {
          current.status = update.status;
        }
      } else {
        current.output = update as PlanContent;
      }
    }
    await this.enqueueEdit();
    return { id: current.id, title: current.title, status: current.status };
  }

  async complete(options: CompletePlanOptions): Promise<void> {
    if (!(this._bound && this._isSupported())) {
      return;
    }
    for (const task of this._plan.tasks) {
      if (task.status === "in_progress") {
        task.status = "complete";
      }
    }
    this._plan.title =
      contentToPlainText(options.completeMessage) || this._plan.title;
    await this.enqueueEdit();
  }

  private enqueueEdit(): Promise<void> {
    if (!this._bound) {
      return Promise.resolve();
    }
    const editPlan = this._bound.adapter.editPlan;
    if (!editPlan) {
      return Promise.resolve();
    }
    const bound = this._bound;
    const doEdit = async (): Promise<void> => {
      await editPlan.call(
        bound.adapter,
        bound.threadIdForEdits,
        bound.messageId,
        this._plan
      );
    };
    const chained = bound.updateChain.then(doEdit, doEdit);
    bound.updateChain = chained.then(
      () => undefined,
      (err) => {
        console.warn("[Plan] Failed to edit plan:", err);
      }
    );
    return chained;
  }
}
