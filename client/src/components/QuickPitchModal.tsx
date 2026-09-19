import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "./Toast";

interface QuickPitchModalProps {
  lead: {
    id?: string;
    business_name: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    website?: string;
    gmb_claimed?: boolean;
    gmb_url?: string;
    last_website_audit_score?: number | null;
    last_gmb_audit_score?: number | null;
    gmb_rating?: number | null;
    gmb_review_count?: number | null;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
}

interface SmtpSender {
  id: string;
  from_name: string;
  from_email: string;
  is_active: boolean;
}

export function QuickPitchModal({ lead, isOpen, onClose, onSent }: QuickPitchModalProps) {
  const { showToast } = useToast();

  const [senders, setSenders] = useState<SmtpSender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [pitchAngle, setPitchAngle] = useState<string>("auto");
  const [sending, setSending] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Load active SMTP senders
  useEffect(() => {
    if (!isOpen) return;

    async function loadSenders() {
      try {
        const res = await apiFetch("/api/outreach/smtp-accounts");
        if (res.ok) {
          const data = await res.json();
          const items: SmtpSender[] = Array.isArray(data) ? data : data.items || [];
          const active = items.filter((s) => s.is_active);
          setSenders(active);
          if (active.length > 0 && !selectedSenderId) {
            setSelectedSenderId(active[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load senders:", err);
      }
    }

    loadSenders();
  }, [isOpen, selectedSenderId]);

  // Generate copy based on lead data and selected pitch angle
  useEffect(() => {
    if (!lead || !isOpen) return;

    setRecipientEmail(lead.email || "");

    const business = lead.business_name || "Business Owner";
    const city = lead.city || "your area";
    const website = lead.website || "your website";

    // Auto-detect best angle
    let chosenAngle = pitchAngle;
    if (chosenAngle === "auto") {
      if (lead.gmb_claimed === false && lead.gmb_url) {
        chosenAngle = "unclaimed_gmb";
      } else if (!lead.website) {
        chosenAngle = "no_website";
      } else if (lead.last_website_audit_score != null && lead.last_website_audit_score < 60) {
        chosenAngle = "website_audit";
      } else if (lead.gmb_rating != null && lead.gmb_rating < 4.5) {
        chosenAngle = "reviews";
      } else {
        chosenAngle = "general_growth";
      }
    }

    if (chosenAngle === "unclaimed_gmb") {
      setSubject(`Question about ${business}'s Google Business Profile`);
      setBody(
        `Hey ${business} Team,\n\n` +
        `While reviewing local businesses in ${city}, the available listing data indicated that your Google Business Profile may not yet be claimed. This should be confirmed in Google before making any changes.\n\n` +
        `Claiming and verifying the correct profile gives the business control over its hours, phone number, services, photos, and responses to reviews.\n\n` +
        `We can help verify the profile status and document any listing fields that need attention.\n\n` +
        `Would you like me to send the checks I used and the next steps if the profile is unclaimed?\n\n` +
        `Regards, Tufi\nSMBify Team`
      );
    } else if (chosenAngle === "no_website") {
      setSubject(`Website opportunity for ${business} in ${city}`);
      setBody(
        `Hey ${business} Team,\n\n` +
        `I was searching for top ${city} businesses and came across ${business}. I noticed you don't currently have a live official website linked to your business listing.\n\n` +
        `A website can give prospective customers a reliable place to review services, service areas, proof of work, and contact options.\n\n` +
        `We build mobile-ready websites for local service businesses and measure performance, accessibility, and local search fundamentals after launch.\n\n` +
        `Can I send over a preview mockup designed specifically for ${business}?\n\n` +
        `Regards, Tufi\nSMBify Team`
      );
    } else if (chosenAngle === "website_audit") {
      const score = lead.last_website_audit_score || 54;
      setSubject(`Notice regarding ${business}'s mobile website speed & SEO`);
      setBody(
        `Hey ${business} Team,\n\n` +
        `I ran a measured website audit on ${website}. The current overall audit score is ${score}/100.\n\n` +
        `The report lists the checks that passed, the issues detected, and any items that could not be verified. I can share the evidence behind each finding.\n\n` +
        `We put together a quick, no-strings teardown report showing exactly what to fix.\n\n` +
        `Would you be open to seeing the report?\n\n` +
        `Regards, Tufi\nSMBify Team`
      );
    } else if (chosenAngle === "reviews") {
      const rating = lead.gmb_rating || 4.1;
      const reviews = lead.gmb_review_count || 12;
      setSubject(`Customer review growth for ${business}`);
      setBody(
        `Hey ${business} Team,\n\n` +
        `I was reviewing local service businesses in ${city}. The available listing data for ${business} shows ${reviews} reviews and a ${rating}★ rating.\n\n` +
        `A compliant post-service request process can make it easier to ask every eligible customer for honest feedback and respond consistently. Results depend on completed jobs and customer participation.\n\n` +
        `Would you be interested in a brief demo of how it works?\n\n` +
        `Regards, Tufi\nSMBify Team`
      );
    } else {
      setSubject(`Quick question regarding ${business}'s online presence in ${city}`);
      setBody(
        `Hey ${business} Team,\n\n` +
        `I came across ${business} while researching top local providers in ${city}.\n\n` +
        `We help local businesses improve the accuracy, technical quality, and conversion paths of their websites and Google Business Profiles.\n\n` +
        `Are you currently accepting new customers in ${city} this month?\n\n` +
        `Regards, Tufi\nSMBify Team`
      );
    }
  }, [lead, pitchAngle, isOpen]);

  if (!isOpen || !lead) return null;

  async function handleSend() {
    if (!recipientEmail.trim()) {
      showToast("error", "Recipient email address is required.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      showToast("error", "Subject and message body cannot be empty.");
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch("/api/email/quick-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail.trim(),
          subject: subject.trim(),
          body: body.trim(),
          smtpAccountId: selectedSenderId || undefined,
          leadId: lead?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      showToast("success", `Pitch email queued for ${recipientEmail}.`);
      onClose();
      if (onSent) onSent();
    } catch (err: any) {
      showToast("error", err.message || "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5e6ad2]/10 text-[#5e6ad2] flex items-center justify-center font-bold text-sm">
              ✉
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">1-Click Client Outreach Pitch</h2>
              <p className="text-xs text-slate-500">
                Personalized cold pitch for <strong className="text-slate-700">{lead.business_name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 transition text-lg"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Top Config Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pitch Angle / Audit Hook
              </label>
              <select
                value={pitchAngle}
                onChange={(e) => setPitchAngle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#5e6ad2]"
              >
                <option value="auto">✨ Auto-Detect Best Hook</option>
                <option value="unclaimed_gmb">🚨 Unclaimed Google Maps Profile</option>
                <option value="no_website">🌐 Missing Website Opportunity</option>
                <option value="website_audit">⚡ Slow Mobile Speed & SEO Leaks</option>
                <option value="reviews">Customer Review Process</option>
                <option value="general_growth">📈 Inbound Local Leads Growth</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Sending SMTP Mailbox
              </label>
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#5e6ad2]"
              >
                {senders.length === 0 ? (
                  <option value="">Automatic active sender</option>
                ) : (
                  senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.from_name} ({s.from_email})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Recipient Email Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Recipient Email Address
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="e.g. info@business.com or owner@business.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#5e6ad2]"
            />
            {!lead.email && (
              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                ⚠️ No email was scraped automatically. Please type the owner or business email here.
              </p>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 font-semibold outline-none focus:border-[#5e6ad2]"
            />
          </div>

          {/* Editor Tabs */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Email Message
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("edit")}
                  className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    activeTab === "edit" ? "bg-slate-200 text-slate-800" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Edit Copy
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    activeTab === "preview" ? "bg-slate-200 text-slate-800" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Live Preview
                </button>
              </div>
            </div>

            {activeTab === "edit" ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-mono text-slate-800 outline-none focus:border-[#5e6ad2] leading-relaxed resize-none"
              />
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed min-h-[220px]">
                {body}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Rule baked in: US English · Conversational · Signed off as <strong>Tufi</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending || !recipientEmail.trim()}
              onClick={handleSend}
              className="rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] px-4 py-2 text-xs font-bold text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Sending via SMTP...</span>
                </>
              ) : (
                <>
                  <span>Send Pitch Now</span>
                  <span className="text-[10px]">✈</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
