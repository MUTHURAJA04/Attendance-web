"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DailyAttendancePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/attendance");
  }, [router]);

  return <div className="centered py-12 text-muted-foreground font-medium">Redirecting to Attendance...</div>;
}
