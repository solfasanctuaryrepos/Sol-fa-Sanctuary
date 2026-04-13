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
        a: 'Yes, completely free. No ads, no subscriptions.',
      },
    ],
  },
  {
    title: 'Using the App',
    items: [
      {
        q: 'Can I download sheets for free?',
        a: 'Yes! All public sheets on Sol-fa Sanctuary are freely available to download. Simply open a sheet and click the Download button.',
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
