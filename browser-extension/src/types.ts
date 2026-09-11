export type WorkType = "Remote" | "Hybrid" | "In-Person" | "Unknown";

export interface DetectedJob {
  company: string;
  role: string;
  location?: string | null;
  portal: string;
  work_type: WorkType;
  salary?: string | null;
  job_id?: string | null;
  url: string;
  description?: string | null;
  employment_type?: string | null;
  source: string;
  confidence: number;
}

export interface CaptureStatusResponse {
  app: string;
  version: string;
  status: string;
}

export interface CapturePayload {
  company: string;
  role: string;
  location?: string | null;
  portal?: string | null;
  work_type?: string | null;
  salary?: string | null;
  job_id?: string | null;
  url: string;
  description?: string | null;
  employment_type?: string | null;
}

export interface ExtensionSettings {
  token: string;
  autoCapture: boolean;
  serverUrl: string;
}
