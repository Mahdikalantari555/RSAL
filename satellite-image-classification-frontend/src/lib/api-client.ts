import axios, { AxiosError } from "axios";

/**
 * Defaults to the in-app Next.js API routes. Point `NEXT_PUBLIC_API_BASE_URL`
 * at a FastAPI/other backend to use an external active-learning service with
 * the same contract (e.g. http://localhost:8000).
 */
const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "/api";

export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { Accept: "application/json" },
});

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; detail?: string; message?: string }>;
    const payload = axiosError.response?.data;
    return (
      payload?.error ||
      payload?.detail ||
      payload?.message ||
      axiosError.message ||
      "Something went wrong"
    );
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
