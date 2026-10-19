import { ArrowDown, Check, ClipboardList, MessageSquareText, UserRoundCheck, Wrench } from "lucide-react";

const steps = [
  { icon: ClipboardList, title: "You report it", description: "The issue, location, and photos in one place.", label: "Submitted" },
  { icon: UserRoundCheck, title: "Your hostel takes it forward", description: "An admin reviews it and assigns the right staff.", label: "Triaged → Assigned" },
  { icon: Wrench, title: "The repair takes shape", description: "Staff share progress and record the resolution.", label: "In progress → Resolved" },
  { icon: Check, title: "You confirm the fix", description: "Check the repair and close the loop.", label: "Closed" },
];

export function JourneyIllustration() {
  return <figure className="relative mx-auto w-full max-w-[510px] lg:ml-auto" aria-labelledby="journey-caption">
    <div aria-hidden="true" className="journey-grid absolute -inset-4 rounded-[2rem] bg-brand-soft/60 sm:-inset-6" />
    <div className="relative overflow-hidden rounded-2xl border border-white bg-white shadow-[0_18px_50px_-20px_#31523438]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
        <span className="flex items-center gap-2 text-xs font-semibold text-brand"><span className="size-2 rounded-full bg-brand" aria-hidden="true" /> One shared record</span>
        <span className="font-mono text-[10px] tracking-widest text-muted">HOSTELFIX / WORKFLOW</span>
      </div>
      <div className="px-5 py-6 sm:px-7">
        <figcaption id="journey-caption" className="mb-6"><p className="text-xl font-semibold tracking-tight">A clear path to a better room.</p><p className="mt-1.5 text-xs text-muted">An illustrated complaint journey</p></figcaption>
        <ol className="space-y-0">
          {steps.map(({ icon: Icon, title, description, label }, index) => <li key={title} className="relative flex gap-3.5 pb-5 last:pb-0 sm:gap-4">
            {index < steps.length - 1 && <span className="absolute top-11 bottom-0 left-5 border-l border-dashed border-brand/25" aria-hidden="true" />}
            <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl ${index === 3 ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}><Icon className="size-[18px]" aria-hidden="true" /></span>
            <div className="pt-0.5"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{description}</p><p className="mt-1.5 text-[10px] font-semibold tracking-wide text-brand">{label}</p></div>
          </li>)}
        </ol>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-canvas px-5 py-4 text-xs text-muted sm:px-7"><MessageSquareText className="size-4 shrink-0 text-brand" aria-hidden="true" /> Every update stays with the complaint.</div>
    </div>
    <div aria-hidden="true" className="absolute -right-3 -bottom-4 flex size-12 rotate-[-10deg] items-center justify-center rounded-2xl border-4 border-canvas bg-lime text-brand sm:-right-5"><ArrowDown className="size-5 -rotate-45" /></div>
  </figure>;
}
