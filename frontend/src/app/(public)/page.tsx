import { ArrowRight, ArrowUpRight, Check, ClipboardList, GraduationCap, ListChecks, MapPin, MessageSquareText, ShieldCheck, UsersRound, Wrench } from "lucide-react";
import { Container } from "@/components/layout/container";
import { JourneyIllustration } from "@/components/layout/journey-illustration";
import { ButtonLink } from "@/components/ui/button";

const benefits = [
  { icon: ClipboardList, title: "One place to report", text: "Room repairs and shared-space issues, with the context that matters." },
  { icon: UsersRound, title: "Clear responsibility", text: "A named assignee, a defined next step, and a record of each decision." },
  { icon: MessageSquareText, title: "Less chasing for updates", text: "Follow progress and keep the conversation with the complaint." },
];

const audiences = [
  { icon: GraduationCap, number: "01", title: "For students", tagline: "Get back to hostel life.", points: ["Report your room or a shared-space issue", "Track your complaints and their history", "Confirm a repair or request a follow-up"] },
  { icon: Wrench, number: "02", title: "For maintenance staff", tagline: "Know what needs your attention.", points: ["Find work assigned to you", "Keep students informed as work progresses", "Record the repair and its resolution"] },
  { icon: ShieldCheck, number: "03", title: "For hostel admins", tagline: "Keep the hostel moving.", points: ["Review and triage incoming complaints", "Assign eligible staff to each repair", "Keep an eye on unassigned and overdue work"] },
];

export default function LandingPage() {
  return <>
    <section className="overflow-hidden pb-14 pt-14 sm:pb-20 sm:pt-20 lg:pb-20 lg:pt-24" aria-labelledby="hero-heading">
      <Container className="grid items-center gap-14 lg:grid-cols-[1.06fr_1fr] lg:gap-14">
        <div className="max-w-xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand-soft/65 px-3.5 py-2 text-[10px] font-bold tracking-[0.12em] text-brand"><span className="size-1.5 rounded-full bg-brand" aria-hidden="true" /> BUILT AROUND HOSTEL LIFE</p>
          <h1 id="hero-heading" className="text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.06] font-semibold tracking-[-0.065em]">A better place<br />to live.<br /><span className="text-brand">A simpler way<br className="hidden lg:block" /> to fix it.</span></h1>
          <p className="mt-6 max-w-[430px] text-base leading-7 text-muted sm:text-lg sm:leading-8">From the fan that won’t turn to the tap that won’t stop. Report it, follow the progress, and help make your hostel feel like home.</p>
          <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href="/register" className="px-6">Get started <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink><ButtonLink href="#how-it-works" variant="secondary">See how it works <ArrowRight className="size-4" aria-hidden="true" /></ButtonLink></div>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted"><MapPin className="size-3.5 text-brand" aria-hidden="true" /> Your room. Your shared spaces. Your hostel.</p>
        </div>
        <div className="px-4 pb-5 sm:px-6 lg:px-0"><JourneyIllustration /></div>
      </Container>
    </section>

    <section aria-label="Why HostelFix" className="border-y border-line bg-surface/60">
      <Container className="grid divide-y divide-line py-3 md:grid-cols-3 md:divide-x md:divide-y-0 md:py-8">
        {benefits.map(({ icon: Icon, title, text }, index) => <div key={title} className={`flex gap-3.5 py-6 md:py-1 ${index === 0 ? "md:pr-7" : index === 1 ? "md:px-7" : "md:pl-7"}`}>
          <Icon className="mt-1 size-5 shrink-0 text-brand" aria-hidden="true" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-6 text-muted">{text}</p></div>
        </div>)}
      </Container>
    </section>

    <section id="how-it-works" className="py-16 sm:py-24" aria-labelledby="how-heading">
      <Container>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow">Less friction, more follow-through</p><h2 id="how-heading" className="section-title mt-4">Report. Repair.<br />Back to your day.</h2></div><p className="max-w-sm text-sm leading-7 text-muted">Small issues shouldn’t become daily distractions. Give every complaint a place to start and a clear way forward.</p></div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { n: "01", icon: ClipboardList, title: "Tell us what needs fixing", text: "Add a location, describe the issue, and include photos if they help. Your report keeps the important details together." },
            { n: "02", icon: ListChecks, title: "Follow the work", text: "Your hostel reviews the complaint and assigns staff. Check the status, see updates, and add a comment when needed." },
            { n: "03", icon: Check, title: "Close the loop", text: "Once staff record a resolution, check the repair. Confirm that it’s fixed, or reopen an eligible complaint if the issue remains." },
          ].map(({ n, icon: Icon, title, text }) => <div key={n} className="rounded-2xl border border-line bg-surface p-6 sm:p-7"><div className="mb-8 flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" aria-hidden="true" /></span><span className="font-mono text-xs text-muted">/ {n}</span></div><h3 className="text-lg font-semibold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-7 text-muted">{text}</p></div>)}
        </div>
      </Container>
    </section>

    <section id="for-your-hostel" className="border-y border-line bg-brand-soft/55 py-16 sm:py-20" aria-labelledby="roles-heading">
      <Container><div className="max-w-lg"><p className="eyebrow">Different roles. One shared purpose.</p><h2 id="roles-heading" className="section-title mt-4">A better hostel takes<br />all of us.</h2></div>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {audiences.map(({ icon: Icon, title, tagline, points, number }) => <article key={title} className="border-t border-brand/20 pt-6"><div className="flex items-center justify-between"><Icon className="size-6 text-brand" aria-hidden="true" /><span className="font-mono text-xs text-muted">{number}</span></div><h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm text-muted">{tagline}</p><ul className="mt-5 space-y-3">{points.map((point) => <li key={point} className="flex items-start gap-2.5 text-xs leading-6"><Check className="mt-1 size-3.5 shrink-0 text-brand" aria-hidden="true" />{point}</li>)}</ul></article>)}
        </div>
      </Container>
    </section>

    <section className="py-14 sm:py-20" aria-labelledby="cta-heading"><Container><div className="relative overflow-hidden rounded-[1.75rem] bg-brand-dark px-7 py-10 text-white sm:px-12 sm:py-12"><div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center"><div><p className="text-[10px] font-bold tracking-[0.15em] text-lime">A LITTLE CARE GOES A LONG WAY</p><h2 id="cta-heading" className="mt-4 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-4xl">Make room for better hostel life.</h2><p className="mt-3 max-w-lg text-sm leading-7 text-white/80">Start with your student account. Already part of the hostel team? Sign in with the account provided to you.</p></div><ButtonLink href="/register" variant="secondary" className="self-start border-lime bg-lime text-brand-dark hover:bg-white md:self-auto">Create an account <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink></div><div aria-hidden="true" className="absolute -right-24 -bottom-48 size-96 rounded-full border-[50px] border-white/5" /></div></Container></section>
  </>;
}
