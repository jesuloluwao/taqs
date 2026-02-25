import { HelpCircle, Mail, BookOpen, MessageSquare } from 'lucide-react';

function SupportCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft p-5 flex items-start gap-4 animate-slide-up">
      <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-900 leading-tight">{title}</p>
        <p className="text-body-sm text-neutral-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function HelpSupport() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-heading-xl font-display text-neutral-900">Help &amp; Support</h1>
        <p className="text-body-sm text-neutral-500 mt-0.5">
          Get help with TaxEase Nigeria
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden mb-6">
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
            <HelpCircle className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-heading-md text-neutral-900 mb-1">Support resources coming soon</p>
          <p className="text-body-sm text-neutral-500 max-w-xs">
            We're building a comprehensive help centre with guides, FAQs, and video tutorials.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <SupportCard
          icon={BookOpen}
          title="Documentation"
          description="Step-by-step guides for getting started and common tasks — coming soon."
        />
        <SupportCard
          icon={MessageSquare}
          title="Live Chat"
          description="Chat with our support team in real time — coming soon."
        />
        <SupportCard
          icon={Mail}
          title="Email Support"
          description="Send us a message and we'll get back to you within 24 hours — coming soon."
        />
      </div>
    </div>
  );
}
