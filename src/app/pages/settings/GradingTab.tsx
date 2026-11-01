import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  createGradingScale,
  listGradingScales,
  listLevelsWithScales,
  saveGradeBands,
  setLevelGradingScale,
  type GradeBand,
  type GradingScale,
  type GradingType,
} from "../../../lib/data/grades";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const GRADING_TYPE_LABELS: Record<GradingType, string> = {
  ges_numeric: "GES Numeric (1–7 scale, CA 30% + Exam 70%)",
  custom_numeric: "Custom Numeric (CA + Exam 100%)",
  descriptive: "Descriptive (Written observations per subject)",
  checklist: "Checklist / Early-years milestones",
};

function ScaleBandsEditor({ scale }: { scale: GradingScale }) {
  const qc = useQueryClient();
  const [bands, setBands] = useState<
    { minScore: string; maxScore: string; grade: string; remark: string }[]
  >(() =>
    scale.bands.map((b) => ({
      minScore: String(b.minScore),
      maxScore: String(b.maxScore),
      grade: b.grade,
      remark: b.remark,
    })),
  );

  const save = useMutation({
    mutationFn: () =>
      saveGradeBands(
        scale.id,
        bands.map((b) => ({
          minScore: Number(b.minScore),
          maxScore: Number(b.maxScore),
          grade: b.grade,
          remark: b.remark,
        })),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["grading-scales"] });
    },
  });

  const updateRow = (
    idx: number,
    patch: Partial<{ minScore: string; maxScore: string; grade: string; remark: string }>,
  ) => {
    setBands((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setBands((prev) => [
      ...prev,
      { minScore: "0", maxScore: "100", grade: "", remark: "" },
    ]);
  };

  const removeRow = (idx: number) => {
    setBands((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 pr-2 font-medium">Min %</th>
              <th className="pb-2 px-2 font-medium">Max %</th>
              <th className="pb-2 px-2 font-medium">Grade</th>
              <th className="pb-2 px-2 font-medium">Remark</th>
              <th className="pb-2 pl-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {bands.map((b, idx) => (
              <tr key={idx}>
                <td className="py-1.5 pr-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={b.minScore}
                    onChange={(e) => updateRow(idx, { minScore: e.target.value })}
                    className="h-8 w-20 tabular-nums"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={b.maxScore}
                    onChange={(e) => updateRow(idx, { maxScore: e.target.value })}
                    className="h-8 w-20 tabular-nums"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    value={b.grade}
                    onChange={(e) => updateRow(idx, { grade: e.target.value })}
                    placeholder="e.g. 1 or A"
                    className="h-8 w-20"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    value={b.remark}
                    onChange={(e) => updateRow(idx, { remark: e.target.value })}
                    placeholder="e.g. Excellent"
                    className="h-8 min-w-36"
                  />
                </td>
                <td className="py-1.5 pl-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove grade band"
                    onClick={() => removeRow(idx)}
                    className="size-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormMessage
        error={save.isError ? friendlyError(save.error) : null}
        ok={save.isSuccess ? "Grade bands saved." : null}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-3.5" aria-hidden />
          Add band
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            save.isPending ||
            bands.some((b) => !b.grade.trim() || !b.remark.trim())
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving..." : "Save bands"}
        </Button>
      </div>
    </div>
  );
}

export default function GradingTab() {
  const qc = useQueryClient();
  const scalesQuery = useQuery({
    queryKey: ["grading-scales"],
    queryFn: listGradingScales,
  });
  const levelsQuery = useQuery({
    queryKey: ["levels-with-scales"],
    queryFn: listLevelsWithScales,
  });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<GradingType>("custom_numeric");

  const assignScale = useMutation({
    mutationFn: ({ levelId, scaleId }: { levelId: string; scaleId: string }) =>
      setLevelGradingScale(levelId, scaleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["levels-with-scales"] });
    },
  });

  const addScale = useMutation({
    mutationFn: () =>
      createGradingScale({
        name: newName,
        type: newType,
        bands:
          newType === "custom_numeric" || newType === "ges_numeric"
            ? [
                { minScore: 80, maxScore: 100, grade: "A", remark: "Excellent" },
                { minScore: 70, maxScore: 79.99, grade: "B", remark: "Very Good" },
                { minScore: 60, maxScore: 69.99, grade: "C", remark: "Good" },
                { minScore: 50, maxScore: 59.99, grade: "D", remark: "Credit" },
                { minScore: 0, maxScore: 49.99, grade: "F", remark: "Fail" },
              ]
            : undefined,
      }),
    onSuccess: () => {
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["grading-scales"] });
    },
  });

  const submitNewScale = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addScale.mutate();
  };

  if (scalesQuery.isLoading || levelsQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const scales: GradingScale[] = scalesQuery.data ?? [];
  const levels = levelsQuery.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Level -> Grading scale assignment */}
      <section className="surface space-y-3 p-4">
        <div>
          <h2 className="text-base font-medium">Grading scale per level</h2>
          <p className="text-xs text-muted-foreground">
            Choose whether each level uses GES 1–7 numeric grading (CA 30% + Exam
            70%), custom numeric bands, descriptive remarks, or early-years
            checklists.
          </p>
        </div>

        <FormMessage
          error={assignScale.isError ? friendlyError(assignScale.error) : null}
        />

        <ul className="divide-y divide-border text-sm">
          {levels.map((lvl) => (
            <li
              key={lvl.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div>
                <span className="font-medium">{lvl.name}</span>
                {lvl.sitsBece ? (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    BECE
                  </span>
                ) : null}
              </div>
              <NativeSelect
                aria-label={`Grading scale for ${lvl.name}`}
                value={lvl.gradingScaleId ?? ""}
                disabled={assignScale.isPending}
                onChange={(e) => {
                  if (e.target.value) {
                    assignScale.mutate({
                      levelId: lvl.id,
                      scaleId: e.target.value,
                    });
                  }
                }}
                className="w-56 text-xs sm:w-64 sm:text-sm"
              >
                {scales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type.replace("_", " ")})
                  </option>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>
      </section>

      {/* Grading scales & bands */}
      <div className="space-y-4">
        {scales.map((scale) => {
          const isNumeric =
            scale.type === "ges_numeric" || scale.type === "custom_numeric";
          return (
            <section key={scale.id} className="surface space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-medium">{scale.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {GRADING_TYPE_LABELS[scale.type]}
                  </p>
                </div>
              </div>
              {isNumeric ? (
                <ScaleBandsEditor key={scale.id + scale.bands.length} scale={scale} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Teachers enter written observations or milestone remarks for
                  each learning area/subject instead of numeric marks.
                </p>
              )}
            </section>
          );
        })}

        {/* Create new custom scale */}
        <form onSubmit={submitNewScale} className="surface space-y-3 p-4">
          <h2 className="text-base font-medium">New grading scale</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scale name" htmlFor="scale-name">
              <Input
                id="scale-name"
                placeholder="e.g. Kindergarten Checklist"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            <Field label="Grading type" htmlFor="scale-type">
              <NativeSelect
                id="scale-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as GradingType)}
              >
                <option value="ges_numeric">GES Numeric (1–7)</option>
                <option value="custom_numeric">Custom Numeric (A–F)</option>
                <option value="descriptive">Descriptive remarks</option>
                <option value="checklist">Checklist milestones</option>
              </NativeSelect>
            </Field>
          </div>
          <FormMessage
            error={addScale.isError ? friendlyError(addScale.error) : null}
          />
          <Button
            type="submit"
            size="sm"
            disabled={addScale.isPending || !newName.trim()}
          >
            {addScale.isPending ? "Creating..." : "Create scale"}
          </Button>
        </form>
      </div>
    </div>
  );
}

