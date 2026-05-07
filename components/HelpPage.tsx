import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Mail } from 'lucide-react';

interface HelpPageProps {
  darkMode: boolean;
}

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'About Sol-fa',
    items: [
      {
        q: 'What is Tonic Sol-fa notation?',
        a: 'Tonic Sol-fa is a music education system using syllables (Do, Re, Mi, Fa, Sol, La, Ti) to represent musical notes. It was developed by Sarah Glover and popularised by John Curwen in the 19th century, and is widely used in choir music, particularly in African Christian communities.',
      },
      {
        q: 'Is Sol-fa Sanctuary free?',
        a: 'Sol-fa Sanctuary is freemium. The Free plan lets you browse, preview all sheets, and download up to 3 sheets per month. Upgrading to Maestro (3 USD/month or 1,200 XAF/month) removes that limit, turns off ads, and adds offline access. Ensemble (100 USD/year or 25,000 XAF/year) adds a shared team workspace for up to 20 members. Founding Members get all Maestro benefits locked in at a special rate forever.',
      },
    ],
  },
  {
    title: 'Using the App',
    items: [
      {
        q: 'Can I download sheets for free?',
        a: 'Free accounts can download up to 3 sheets per month. Maestro, Ensemble, and Founding Member plans include unlimited downloads. Your monthly count resets on the 1st of each month.',
      },
      {
        q: 'What are Collections?',
        a: 'Collections let you organise sheets into themed groups — like "Sunday Service" or "Christmas Carols". You can make collections public and share them with others.',
      },
      {
        q: 'How do I share a sheet?',
        a: 'Open any sheet and click the Share button. This copies a direct link to your clipboard that anyone can use to view the sheet.',
      },
      {
        q: 'Can I edit a sheet I\'ve already uploaded?',
        a: 'Yes. In your Dashboard, click the edit (pencil) icon on any sheet. You can update the title, composer, type, visibility, and even replace the PDF file.',
      },
      {
        q: 'How do I save sheets for offline viewing?',
        a: 'On a Maestro, Ensemble, or Founding Member plan, open any sheet and tap the offline save button (cloud icon). The sheet will be available in your Dashboard under the Offline tab even without an internet connection.',
      },
    ],
  },
  {
    title: 'Plans & Billing',
    items: [
      {
        q: 'What plans are available?',
        a: 'Free — browse and preview everything, 3 downloads/month. Maestro — unlimited downloads, offline access, ad-free, submit & vote on requests (3 USD/mo or 24 USD/yr). Ensemble — everything in Maestro plus a shared team workspace for up to 20 members (100 USD/yr). Founding Member — all Maestro benefits at a permanently locked rate, available by invite only.',
      },
      {
        q: 'What payment methods do you accept?',
        a: 'In Cameroon we accept MTN Mobile Money and Orange Money. International users can pay by card or crypto. All payments are processed securely through Moneroo.',
      },
      {
        q: 'How do I upgrade my plan?',
        a: 'Go to the Pricing page (bottom navigation) and click the upgrade button for your chosen plan. You will be redirected to the payment page. Once payment is confirmed your plan activates automatically — no need to contact support.',
      },
      {
        q: 'What is a Founding Member?',
        a: 'Founding Members get all Maestro features at a permanently fixed annual rate (12 USD/yr or 3,000 XAF/yr) — the price never increases no matter what future pricing looks like. Founding status is granted by admin invite via exclusive promo codes. Redeem your code on the Pricing page to unlock the Founding Member subscription.',
      },
      {
        q: 'Do plans auto-renew?',
        a: 'Currently plans do not auto-renew. You will need to renew manually before expiry to keep your plan benefits. Founding Members keep their locked-in rate on each manual renewal.',
      },
      {
        q: 'What happens if my plan expires?',
        a: 'Your account reverts to the Free tier. Your uploads, collections, and saved offline sheets remain intact — only the paid features (unlimited downloads, offline access, etc.) become unavailable until you renew.',
      },
      {
        q: 'I paid but my plan hasn\'t updated. What do I do?',
        a: 'After completing payment, return to the app — it automatically verifies your payment and updates your plan. If it still shows the old plan after a minute, try refreshing the page or signing out and back in. If the issue persists, contact solfasanctuary@gmail.com with your payment reference.',
      },
    ],
  },
  {
    title: 'Teams & Ensemble',
    items: [
      {
        q: 'What is the Ensemble plan?',
        a: 'Ensemble is a team plan for choirs, music groups, and ensembles. One subscription covers up to 20 members who all share unlimited downloads, offline access, and a private shared workspace with collections of sheets.',
      },
      {
        q: 'How do I create a team?',
        a: 'Upgrade to the Ensemble plan, then navigate to the Team tab. You will be prompted to name your organisation. Once created, you can invite members or enable discoverability so members can find and request to join your team.',
      },
      {
        q: 'How do I invite members to my team?',
        a: 'In the Team tab, go to the Members section and enter the email address of the person you want to invite. They will see the invitation when they open the Team tab or the "Join a Team" modal in their Dashboard.',
      },
      {
        q: 'How do I join a team?',
        a: 'From your Dashboard, click "Join a Team". You will see any pending invites at the top, and a searchable list of discoverable teams below. You can send a join request (with an optional message) to any team. The team admin will review and approve or decline your request.',
      },
      {
        q: 'Do members need their own Ensemble subscription?',
        a: 'No. Members benefit from the team\'s Ensemble plan through their membership — they do not need to purchase a separate subscription. Only the team owner needs to hold the Ensemble plan.',
      },
      {
        q: 'What are Shared Collections?',
        a: 'Shared Collections are team-only curated sheet lists. Any team member or admin can create a collection, add sheets to it, and all members can access it — great for organising rehearsal repertoire.',
      },
    ],
  },
  {
    title: 'Accounts & Privacy',
    items: [
      {
        q: 'How do I upload a sheet?',
        a: 'Create a free account, verify your email, then click the Upload button. You can upload any PDF file up to 10MB. Your sheet will be reviewed and made available to the community.',
      },
      {
        q: 'How do I make my sheet private?',
        a: 'In your Dashboard, click the lock icon on any sheet to toggle it between public and private. Private sheets are only visible to you.',
      },
      {
        q: 'I forgot my password. What do I do?',
        a: 'Click "Sign In", then "Forgot Password?". Enter your email and we\'ll send a reset link.',
      },
      {
        q: 'How do I report inappropriate content?',
        a: 'Please email solfasanctuary@gmail.com with a link to the content and a brief description of the issue.',
      },
    ],
  },
];

const AccordionItem: React.FC<{ item: FaqItem; isOpen: boolean; onToggle: () => void; darkMode: boolean }> = ({
  item,
  isOpen,
  onToggle,
  darkMode,
}) => {
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const borderClass = darkMode ? 'border-slate-800' : 'border-slate-200';
  const hoverBg = darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50';

  return (
    <div className={`border-b ${borderClass}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${hoverBg}`}
        aria-expanded={isOpen}
      >
        <span className={`font-medium text-sm md:text-base ${textPrimary}`}>{item.q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 ml-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}
        />
      </button>
      {isOpen && (
        <div className={`px-5 pb-4 text-sm leading-relaxed ${textSecondary}`}>
          {item.a}
        </div>
      )}
    </div>
  );
};

const HelpPage: React.FC<HelpPageProps> = ({ darkMode }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const sectionTitleClass = darkMode ? 'text-green-400' : 'text-green-600';

  return (
    <div className="space-y-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${darkMode ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-100'}`}>
          <HelpCircle className="text-green-500" size={28} />
        </div>
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Help & FAQ</h1>
          <p className={textSecondary}>Everything you need to know about Sol-fa Sanctuary.</p>
        </div>
      </div>

      {/* Accordion sections */}
      {FAQ_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className={`text-xs font-bold uppercase tracking-widest mb-3 ${sectionTitleClass}`}>{section.title}</h2>
          <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
            {section.items.map((item, idx) => {
              const key = `${section.title}-${idx}`;
              return (
                <AccordionItem
                  key={key}
                  item={item}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                  darkMode={darkMode}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Contact footer */}
      <div className={`rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${cardBg}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          <Mail className={textSecondary.replace('text-', 'text-')} size={22} />
        </div>
        <div>
          <p className={`font-semibold ${textPrimary}`}>Still have questions?</p>
          <p className={`text-sm ${textSecondary}`}>
            Contact us at{' '}
            <a
              href="mailto:solfasanctuary@gmail.com"
              className="text-green-500 hover:text-green-400 font-medium underline underline-offset-2"
            >
              solfasanctuary@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
