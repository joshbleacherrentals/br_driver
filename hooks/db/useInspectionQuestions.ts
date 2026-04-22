import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type InspectionQuestion = {
  id: string;
  question_text: string | null;
  required: number | null;
  question_type: string | null;
  is_active: number | null;
  sort_order: number | null;
};

export function useInspectionQuestions(): { questions: InspectionQuestion[] } {
  const compiled = useMemo(() => {
    return db
      .selectFrom("InspectionQuestions")
      .select(["id", "question_text", "required", "question_type", "is_active", "sort_order"])
      .where("is_active", "=", 1)
      .orderBy("sort_order", "asc")
      .compile();
  }, []);

  const result = useTypedQuery(compiled, expect<InspectionQuestion>());

  return { questions: result.data ?? [] };
}