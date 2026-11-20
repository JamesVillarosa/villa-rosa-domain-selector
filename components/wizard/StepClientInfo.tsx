/** Step 1 — Client Information. Required fields: company name, website. */

"use client";

import { useWizard } from "./WizardContext";

export default function StepClientInfo() {
  const { state, set, errors, clearError } = useWizard();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Client Information</h2>
        <p className="muted text-xs">
          Captured here so the campaign carries the right context throughout.
        </p>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Company name *</label>
          <input
            value={state.companyName}
            onChange={(e) => {
              set("companyName", e.target.value);
              clearError("companyName");
            }}
            placeholder="Acme Corp"
            data-error={!!errors.companyName}
          />
          {errors.companyName && (
            <div className="error-msg">{errors.companyName}</div>
          )}
        </div>
        <div>
          <label className="label">Website *</label>
          <input
            value={state.website}
            onChange={(e) => {
              set("website", e.target.value);
              clearError("website");
            }}
            placeholder="https://acmecorp.com"
            data-error={!!errors.website}
          />
          {errors.website && (
            <div className="error-msg">{errors.website}</div>
          )}
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Primary contact</label>
          <input
            value={state.primaryContact}
            onChange={(e) => set("primaryContact", e.target.value)}
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="label">Contact email</label>
          <input
            type="email"
            value={state.contactEmail}
            onChange={(e) => {
              set("contactEmail", e.target.value);
              clearError("contactEmail");
            }}
            placeholder="john@acmecorp.com"
            data-error={!!errors.contactEmail}
          />
          {errors.contactEmail && (
            <div className="error-msg">{errors.contactEmail}</div>
          )}
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Industry</label>
          <input
            value={state.industry}
            onChange={(e) => set("industry", e.target.value)}
            placeholder="e.g. SaaS, Fintech, E-commerce"
          />
        </div>
        <div>
          <label className="label">Assigned account manager</label>
          <input
            value={state.accountManager}
            onChange={(e) => set("accountManager", e.target.value)}
            placeholder="Sarah"
          />
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Campaign start date</label>
          <input
            type="text"
            value={state.campaignStartDate}
            onChange={(e) => set("campaignStartDate", e.target.value)}
            placeholder="dd/mm/yyyy"
          />
        </div>
        <div>
          <label className="label">Billing cycle</label>
          <select
            value={state.billingCycle}
            onChange={(e) =>
              set(
                "billingCycle",
                e.target.value as "Monthly" | "Quarterly" | "Annual"
              )
            }
          >
            <option>Monthly</option>
            <option>Quarterly</option>
            <option>Annual</option>
          </select>
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Contract value ($)</label>
          <input
            type="number"
            value={state.contractValue}
            onChange={(e) => {
              set("contractValue", e.target.value);
              clearError("contractValue");
            }}
            placeholder="5000"
            data-error={!!errors.contractValue}
          />
          <div className="muted text-[11px] mt-1">Monthly value</div>
          {errors.contractValue && (
            <div className="error-msg">{errors.contractValue}</div>
          )}
        </div>
        <div />
      </div>
    </div>
  );
}
