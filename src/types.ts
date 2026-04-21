export type EventType = "db" | "http" | "middleware";

export interface TimelineEvent {
  type: EventType;
  duration: number;
  meta?: {
    query?: string;
    url?: string;
  };
}

export interface RequestContext {
  timeline: TimelineEvent[];
  startTime: number;
}