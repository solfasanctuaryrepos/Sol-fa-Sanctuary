
import React from 'react';
import { Mail, Github, Linkedin, Music, Code, Heart, Sparkles, MapPin, ExternalLink, ArrowRight } from 'lucide-react';

interface AboutPageProps {
  darkMode: boolean;
}

const AboutPage: React.FC<AboutPageProps> = ({ darkMode }) => {
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  return (
    <div className="max-w-4xl mx-auto space-y-24 animate-in fade-in duration-700 pb-12">
      {/* Hero Profile Section */}
      <section className="text-center space-y-8 pt-8">
        <div className="relative inline-block">
          <div className="absolute -inset-4 rounded-full blur-2xl opacity-20 bg-green-500 animate-pulse"></div>
          <div className={`relative w-32 h-32 md:w-40 md:h-40 rounded-full border-4 flex items-center justify-center overflow-hidden bg-gradient-to-br from-green-500 to-emerald-700 ${darkMode ? 'border-slate-800 shadow-2xl shadow-green-500/10' : 'border-white shadow-xl'}`}>
            <span className="text-4xl md:text-5xl font-serif font-bold text-white">VN</span>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-green-500 p-2 rounded-full border-4 border-slate-950 text-slate-950">
            <Sparkles size={20} />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className={`text-5xl md:text-6xl font-serif font-bold ${textPrimary}`}>Vitalis Nkwenti</h1>
          <p className="text-green-500 font-bold uppercase tracking-[0.3em] text-sm">Author & Lead Engineer</p>
          <div className={`flex items-center justify-center gap-2 text-sm ${textSecondary}`}>
            <MapPin size={16} />
            <span>Cameroon • Global Community</span>
          </div>
        </div>
      </section>

      {/* Mission & Story */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className={`text-3xl font-serif font-bold ${textPrimary}`}>The Visionary Behind the Sanctuary</h2>
          <div className={`space-y-4 text-lg leading-relaxed ${textSecondary}`}>
            <p>
              Growing up immersed in the rich choral traditions of the church, I witnessed first-hand the profound impact of 
              <span className="text-green-500 font-medium mx-1">Tonic Sol-fa notation</span>. It wasn't just music; it was a universal language that brought communities together.
            </p>
            <p>
              As a software engineer, I noticed a digital gap. Beautiful Sol-fa scores were often tucked away in physical folders or low-quality scans. 
              <span className="font-semibold text-slate-200">Sol-fa Sanctuary</span> was born from the desire to give these scores a professional, digital home.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className={`p-6 rounded-3xl border ${cardBg}`}>
            <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 mb-4">
              <Music size={24} />
            </div>
            <h3 className={`font-bold mb-1 ${textPrimary}`}>Music Preservation</h3>
            <p className={`text-sm ${textSecondary}`}>Digitizing and protecting choral heritage for future generations of choristers and conductors.</p>
          </div>
          <div className={`p-6 rounded-3xl border ${cardBg}`}>
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-4">
              <Code size={24} />
            </div>
            <h3 className={`font-bold mb-1 ${textPrimary}`}>Technical Excellence</h3>
            <p className={`text-sm ${textSecondary}`}>Leveraging modern cloud technology to provide a fast, secure, and beautiful user experience.</p>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className={`p-12 rounded-[40px] border relative overflow-hidden text-center space-y-8 ${darkMode ? 'bg-slate-900/30 border-slate-800' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
        <Heart className="mx-auto text-red-500/20 fill-red-500/10" size={80} />
        <div className="relative z-10 space-y-4">
          <h2 className={`text-4xl font-serif font-bold ${textPrimary}`}>My Philosophy</h2>
          <p className={`text-xl italic max-w-2xl mx-auto leading-relaxed ${textSecondary}`}>
            "I believe that music should be accessible to everyone, regardless of their background or resources. Sol-fa Sanctuary is my contribution to making that a reality."
          </p>
        </div>
      </section>

      {/* Connect Section */}
      <section className="space-y-12">
        <div className="text-center">
          <h2 className={`text-3xl font-serif font-bold ${textPrimary}`}>Let's Build the Future of Choral Music</h2>
          <p className={`mt-2 ${textSecondary}`}>Have questions, feedback, or just want to chat music?</p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          <a 
            href="mailto:solfasanctuary@gmail.com"
            className="flex items-center gap-3 px-8 py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-2xl transition-all shadow-xl shadow-green-500/20 active:scale-95"
          >
            <Mail size={20} />
            Email Me
          </a>
          <div className="flex gap-4">
            {/* TODO: replace with real profile URLs */}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub profile"
              className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:shadow-lg'}`}
            >
              <Github size={24} />
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn profile"
              className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:shadow-lg'}`}
            >
              <Linkedin size={24} />
            </a>
          </div>
        </div>
      </section>

      <footer className="text-center pt-12 border-t border-slate-800/50">
        <p className={`text-sm ${textSecondary}`}>
          Made with <Heart size={14} className="inline text-red-500 mx-1" /> for the community.
        </p>
      </footer>
    </div>
  );
};

export default AboutPage;