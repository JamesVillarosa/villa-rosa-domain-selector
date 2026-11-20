/**
 * Top-level wizard frame.
 *
 * Renders the seven-step tab bar, the body of the current step, and the
 * Back / Continue footer. Tab gating uses the furthest step the user has
 * reached so they can freely navigate backwards and forwards through any
 * already-visited step. Continue runs the active step's validation before
 * advancing.
 */

"use client";

import { WIZARD_STEPS, stepIndex } from "@/lib/wizardState";
import { useWizard } from "./WizardContext";
import StepClientInfo from "./StepClientInfo";
import StepCampaignSetup from "./StepCampaignSetup";
import StepDomainCriteria from "./StepDomainCriteria";
import StepExpectations from "./StepExpectations";
import StepCallNotes from "./StepCallNotes";
import StepDomainMatching from "./StepDomainMatching";
import StepBrief from "./StepBrief";

export default function Wizard() {
  const { state, back, goTo, validateAndNext, exporting } = useWizard();
  const stepIdx = stepIndex(state.step);
  const furthestIdx = stepIndex(state.furthestStep);
  const isLast = stepIdx === WIZARD_STEPS.length - 1;
  const isFirst = stepIdx === 0;
  const allUnlocked = state.scoringStage === "complete";

  return (
    <div className="panel p-4 flex flex-col gap-4 relative">
      {exporting && (
        <div className="export-toast">
          <span className="export-spinner" /> Exporting campaign…
        </div>
      )}
      <div className="tabbar">
        {WIZARD_STEPS.map((s, i) => {
          const visited = i <= furthestIdx;
          const disabled = !visited && !allUnlocked;
          return (
            <button
              key={s.id}
              data-active={s.id === state.step}
              data-done={i < stepIdx}
              onClick={() => goTo(s.id)}
              disabled={disabled}
              title={s.optional ? "Optional" : ""}
            >
              <span className="muted">{String(i + 1).padStart(2, "0")}</span>{" "}
              {s.label}
              {s.optional ? " ·" : ""}
            </button>
          );
        })}
      </div>

      <div className="px-1 pt-2">
        {state.step === "client" && <StepClientInfo />}
        {state.step === "campaign" && <StepCampaignSetup />}
        {state.step === "criteria" && <StepDomainCriteria />}
        {state.step === "goals" && <StepExpectations />}
        {state.step === "calls" && <StepCallNotes />}
        {state.step === "domains" && <StepDomainMatching />}
        {state.step === "brief" && <StepBrief />}
      </div>

      {state.step !== "brief" && state.step !== "domains" && (
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] mt-2">
          {isFirst ? (
            <span />
          ) : (
            <button className="btn btn-ghost" onClick={back}>
              ← Back
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => validateAndNext()}
            disabled={isLast}
          >
            Continue →
          </button>
        </div>
      )}

      {state.step === "domains" && !isFirst && (
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] mt-2">
          <button className="btn btn-ghost" onClick={back}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
