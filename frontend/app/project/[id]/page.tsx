"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { getResearchStatus, ResearchStatus } from "@/lib/api";
import AgentTracker from "@/components/tracker/AgentTracker";

const ACTIVE_STATUSES = new Set([
  "pending",
  "searching",
  "analyzing",
  "comparing",
  "gap_finding",
  "reporting",
]);

export default function ProjectPage() {
  const params = useParams();
  const rawId = params?.id;
  const projectId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Status fetcher
  const fetchStatus = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await getResearchStatus(projectId);
      setStatus(data);
      setError(null);
      setIsLoading(false);
      return data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect to the research pipeline backend.";
      setError(message);
      setIsLoading(false);
      return null;
    }
  }, [projectId]);

  // Polling setup: 2.5 seconds (2500ms) while status is active
  useEffect(() => {
    if (!projectId) return;

    // Initial immediate fetch
    fetchStatus().then((initialData) => {
      if (initialData && !ACTIVE_STATUSES.has(initialData.status)) {
        // Already done or error — no need to poll
        return;
      }

      // Start polling interval
      pollIntervalRef.current = setInterval(async () => {
        const latest = await fetchStatus();
        if (!latest) return;

        // Terminate polling if done or error
        if (!ACTIVE_STATUSES.has(latest.status)) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }, 2500);
    });

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [projectId, fetchStatus]);

  // Elapsed time tracker
  useEffect(() => {
    const isFinished = status?.status === "done" || status?.status === "error";

    if (!isFinished) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status?.status]);

  // Manual retry action
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    fetchStatus().then((data) => {
      if (data && ACTIVE_STATUSES.has(data.status)) {
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(async () => {
            const latest = await fetchStatus();
            if (latest && !ACTIVE_STATUSES.has(latest.status)) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          }, 2500);
        }
      }
    });
  }, [fetchStatus]);

  return (
    <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <AgentTracker
        projectId={projectId}
        status={status}
        isLoading={isLoading}
        error={error}
        elapsedSeconds={elapsedSeconds}
        onRetry={handleRetry}
      />
    </div>
  );
}
