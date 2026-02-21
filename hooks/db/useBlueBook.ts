import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type BlueBookData = {
    id: string;
    name: string | null;
    link: string | null;
    description: string | null;
    is_active: number | null;
    region: string | null;
    sort_order: number | null;
};

export function useBlueBook(): { blueBookEntries: BlueBookData[] | null } {
    const compiled = useMemo(() => {
        return db
            .selectFrom("BlueBook")
            .select([
                "id",
                "name",
                "link",
                "description",
                "is_active",
                "region",
                "sort_order",
            ])
            .orderBy("sort_order", "asc")
            .compile();
    }, []);

    const data = useTypedQuery(compiled, expect<BlueBookData>());
    return { blueBookEntries: data.data };
}
