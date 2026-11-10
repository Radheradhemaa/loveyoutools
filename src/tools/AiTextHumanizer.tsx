import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Download,
  ArrowRight,
  Sliders,
  Gauge,
  FileText,
  Eye,
  CheckCircle2,
  Lightbulb,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useFocusMode } from '../contexts/FocusModeContext';

type ToneMode = 'casual' | 'professional' | 'academic' | 'creative' | 'simple';
type StrengthLevel = 'light' | 'medium' | 'deep';

// Common AI buzzwords and robotic phrases mapped to human alternatives
const AI_PHRASE_DICTIONARY: { pattern: RegExp; replacements: { [key in ToneMode]: string[] } }[] = [
  {
    pattern: /\bdelve(?:s|d)?\s+into\b/gi,
    replacements: {
      casual: ['dig into', 'dive into', 'look closely at', 'check out'],
      professional: ['examine', 'explore', 'analyze', 'evaluate'],
      academic: ['investigate', 'analyze', 'scrutinize', 'assess'],
      creative: ['plunge into', 'venture into', 'uncover', 'immerse in'],
      simple: ['look at', 'study', 'talk about', 'check'],
    },
  },
  {
    pattern: /\bin\s+conclusion\b/gi,
    replacements: {
      casual: ['all in all', 'to wrap it up', 'at the end of the day', 'bottom line'],
      professional: ['in summary', 'ultimately', 'to summarize', 'to conclude'],
      academic: ['consequently', 'in sum', 'taken together', 'in final analysis'],
      creative: ['when all is said and done', 'in the end', 'looking back'],
      simple: ['to finish', 'in short', 'overall', 'lastly'],
    },
  },
  {
    pattern: /\bfurthermore\b/gi,
    replacements: {
      casual: ['plus', 'on top of that', 'what\'s more', 'and another thing'],
      professional: ['in addition', 'beyond that', 'moreover', 'also'],
      academic: ['additionally', 'moreover', 'further', 'in tandem'],
      creative: ['as if that weren\'t enough', 'and then some', 'beyond this'],
      simple: ['also', 'and', 'plus', 'next'],
    },
  },
  {
    pattern: /\bmoreover\b/gi,
    replacements: {
      casual: ['also', 'and on top of that', 'plus', 'besides'],
      professional: ['additionally', 'furthermore', 'what is more', 'as well'],
      academic: ['in addition', 'further', 'secondly', 'concomitantly'],
      creative: ['not to mention', 'what makes it even better is', 'along with this'],
      simple: ['also', 'and', 'plus'],
    },
  },
  {
    pattern: /\btestament\s+to\b/gi,
    replacements: {
      casual: ['proof of', 'living proof of', 'clear sign of'],
      professional: ['evidence of', 'reflection of', 'demonstration of'],
      academic: ['demonstration of', 'indicator of', 'corroboration of'],
      creative: ['tribute to', 'echo of', 'mirror of'],
      simple: ['proof of', 'sign of', 'shows that'],
    },
  },
  {
    pattern: /\btapestry\s+of\b/gi,
    replacements: {
      casual: ['mix of', 'blend of', 'collection of'],
      professional: ['combination of', 'spectrum of', 'diverse range of'],
      academic: ['complex array of', 'composite of', 'mosaic of'],
      creative: ['kaleidoscope of', 'mosaic of', 'rich weave of'],
      simple: ['mix of', 'group of', 'set of'],
    },
  },
  {
    pattern: /\brealm\s+of\b/gi,
    replacements: {
      casual: ['world of', 'area of', 'space of'],
      professional: ['domain of', 'sector of', 'sphere of'],
      academic: ['field of', 'discipline of', 'domain of'],
      creative: ['landscape of', 'universe of', 'territory of'],
      simple: ['area of', 'part of', 'world of'],
    },
  },
  {
    pattern: /\bgame-changer\b/gi,
    replacements: {
      casual: ['huge deal', 'real difference maker', 'game changer', 'total win'],
      professional: ['major breakthrough', 'pivotal development', 'significant shift'],
      academic: ['transformative factor', 'paradigm shift', 'notable advancement'],
      creative: ['turning point', 'breath of fresh air', 'seismic shift'],
      simple: ['big change', 'big help', 'new way'],
    },
  },
  {
    pattern: /\bseamlessly\b/gi,
    replacements: {
      casual: ['smoothly', 'without a hitch', 'effortlessly', 'cleanly'],
      professional: ['efficiently', 'fluidly', 'consistently', 'directly'],
      academic: ['integratively', 'cohesively', 'without disruption'],
      creative: ['like clockwork', 'naturally', 'with effortless grace'],
      simple: ['easily', 'smoothly', 'well'],
    },
  },
  {
    pattern: /\bharness(?:ing)?\s+the\s+power\s+of\b/gi,
    replacements: {
      casual: ['using', 'tapping into', 'making the most of'],
      professional: ['leveraging', 'utilizing', 'capitalizing on'],
      academic: ['employing', 'applying', 'mobilizing'],
      creative: ['channeling', 'unleashing', 'drawing from'],
      simple: ['using', 'putting to work', 'working with'],
    },
  },
  {
    pattern: /\bit\s+is\s+important\s+to\s+note\s+that\b/gi,
    replacements: {
      casual: ['keep in mind that', 'note that', 'worth remembering that'],
      professional: ['notably', 'importantly', 'it is worth noting that'],
      academic: ['it is noteworthy that', 'significantly', 'it should be recognized that'],
      creative: ['here\'s the catch:', 'don\'t overlook the fact that'],
      simple: ['remember that', 'note that', 'keep in mind that'],
    },
  },
  {
    pattern: /\bin\s+today's\s+fast-paced\s+world\b/gi,
    replacements: {
      casual: ['these days', 'nowadays', 'today', 'in our modern routine'],
      professional: ['in modern business', 'currently', 'in current industry'],
      academic: ['in contemporary society', 'at present', 'in modern times'],
      creative: ['in a world that never sleeps', 'in today\'s rush', 'nowadays'],
      simple: ['today', 'nowadays', 'these days'],
    },
  },
  {
    pattern: /\bever-evolving\s+landscape\b/gi,
    replacements: {
      casual: ['rapidly changing scene', 'fast-moving space', 'dynamic market'],
      professional: ['dynamic market', 'changing environment', 'evolving industry'],
      academic: ['shifting paradigm', 'evolving context', 'developing discipline'],
      creative: ['shifting tides', 'ever-shifting horizon'],
      simple: ['changing world', 'fast changes', 'new changes'],
    },
  },
  {
    pattern: /\bplethora\s+of\b/gi,
    replacements: {
      casual: ['plenty of', 'tons of', 'lots of', 'a whole bunch of'],
      professional: ['wide variety of', 'broad selection of', 'wealth of'],
      academic: ['multitude of', 'substantial array of', 'abundance of'],
      creative: ['wealth of', 'bounty of', 'sea of'],
      simple: ['many', 'lots of', 'plenty of'],
    },
  },
  {
    pattern: /\bembark\s+on\s+a\s+journey\b/gi,
    replacements: {
      casual: ['get started', 'take the plunge', 'dive in', 'set off'],
      professional: ['initiate the process', 'begin this phase', 'launch efforts'],
      academic: ['commence an inquiry', 'undertake this study'],
      creative: ['set sail', 'venture forth', 'step onto the path'],
      simple: ['start', 'begin', 'get going'],
    },
  },
  {
    pattern: /\bnavigating\s+the\s+intricacies\s+of\b/gi,
    replacements: {
      casual: ['working through the details of', 'getting a grip on', 'handling'],
      professional: ['managing the complexities of', 'addressing the nuances of'],
      academic: ['analyzing the complexities of', 'explicating the parameters of'],
      creative: ['threading the maze of', 'unraveling'],
      simple: ['understanding', 'handling', 'working through'],
    },
  },
  {
    pattern: /\bshed(?:s|ding)?\s+light\s+on\b/gi,
    replacements: {
      casual: ['clearing up', 'explaining', 'giving context to'],
      professional: ['clarifying', 'illuminating', 'highlighting'],
      academic: ['elucidating', 'explicating', 'clarifying'],
      creative: ['casting light upon', 'revealing'],
      simple: ['explaining', 'showing', 'making clear'],
    },
  },
  {
    pattern: /\bparamount\b/gi,
    replacements: {
      casual: ['super important', 'top priority', 'huge', 'vital'],
      professional: ['critical', 'essential', 'top priority', 'vital'],
      academic: ['of primary importance', 'pivotal', 'indispensable'],
      creative: ['cornerstone', 'lifeblood', 'vital pulse'],
      simple: ['very important', 'key', 'main'],
    },
  },
  {
    pattern: /\bmeticulous(?:ly)?\b/gi,
    replacements: {
      casual: ['super carefully', 'down to the wire', 'very thoroughly'],
      professional: ['thoroughly', 'with precision', 'carefully', 'rigorously'],
      academic: ['scrupulously', 'rigorously', 'methodically'],
      creative: ['with painstaking care', 'with watchful precision'],
      simple: ['carefully', 'well', 'step by step'],
    },
  },
  {
    pattern: /\bcrucial\s+role\b/gi,
    replacements: {
      casual: ['huge part', 'big part', 'key role'],
      professional: ['key function', 'pivotal role', 'vital contribution'],
      academic: ['integral role', 'substantive function', 'determining factor'],
      creative: ['beating heart', 'vital spark', 'main anchor'],
      simple: ['big part', 'main role', 'key job'],
    },
  },
  {
    pattern: /\bfoster(?:ing)?\b/gi,
    replacements: {
      casual: ['building', 'growing', 'encouraging', 'nurturing'],
      professional: ['cultivating', 'promoting', 'developing', 'supporting'],
      academic: ['facilitating', 'cultivating', 'advancing'],
      creative: ['kindling', 'nurturing', 'nourishing'],
      simple: ['helping', 'growing', 'building'],
    },
  },
  {
    pattern: /\bholistic\b/gi,
    replacements: {
      casual: ['all-round', 'complete', 'big-picture', 'whole'],
      professional: ['comprehensive', 'end-to-end', 'integrated'],
      academic: ['comprehensive', 'systemic', 'integrative'],
      creative: ['kaleidoscopic', 'panoramic', 'all-encompassing'],
      simple: ['complete', 'whole', 'all-around'],
    },
  },
  {
    pattern: /\bin\s+order\s+to\b/gi,
    replacements: {
      casual: ['to', 'so you can', 'to help'],
      professional: ['to', 'aiming to', 'with the goal to'],
      academic: ['so as to', 'to', 'with the intent to'],
      creative: ['so as to', 'in quest to'],
      simple: ['to', 'so that'],
    },
  },
  {
    pattern: /\butilize(?:s|d|ing)?\b/gi,
    replacements: {
      casual: ['use', 'uses', 'used', 'using'],
      professional: ['use', 'apply', 'leverage', 'adopt'],
      academic: ['employ', 'apply', 'implement'],
      creative: ['draw upon', 'wield', 'harness'],
      simple: ['use', 'uses', 'used', 'using'],
    },
  },
];

// Contractions for humanized flow
const CONTRACTIONS: [RegExp, string][] = [
  [/\bit\s+is\b/gi, "it's"],
  [/\bthat\s+is\b/gi, "that's"],
  [/\bthere\s+is\b/gi, "there's"],
  [/\bwhat\s+is\b/gi, "what's"],
  [/\bdo\s+not\b/gi, "don't"],
  [/\bdoes\s+not\b/gi, "doesn't"],
  [/\bdid\s+not\b/gi, "didn't"],
  [/\bcannot\b/gi, "can't"],
  [/\bcan\s+not\b/gi, "can't"],
  [/\bwill\s+not\b/gi, "won't"],
  [/\bwould\s+not\b/gi, "wouldn't"],
  [/\bshould\s+not\b/gi, "shouldn't"],
  [/\bcould\s+not\b/gi, "couldn't"],
  [/\bthey\s+are\b/gi, "they're"],
  [/\bwe\s+are\b/gi, "we're"],
  [/\byou\s+are\b/gi, "you're"],
  [/\bwe\s+have\b/gi, "we've"],
  [/\byou\s+have\b/gi, "you've"],
  [/\bthey\s+have\b/gi, "they've"],
];

const SAMPLE_TEXTS = {
  chatgpt_essay: `In today's fast-paced world, artificial intelligence plays a crucial role in navigating the intricacies of modern industry. Furthermore, harnessing the power of cutting-edge algorithms is a testament to human ingenuity. It is important to note that organizations must delve into a tapestry of technologies in order to foster an environment of continuous growth. In conclusion, adopting a holistic approach is paramount to succeeding in this ever-evolving landscape.`,
  cover_letter: `I am writing to express my profound enthusiasm for the Senior Project Manager position. With a plethora of experiences leading cross-functional teams, I have consistently utilized a holistic methodology to spearhead organizational transformation. Delving into complex deliverables and fostering collaborative relationships has been a testament to my dedication. In today's fast-paced world, my meticulous approach will prove paramount to your company's ever-evolving landscape.`,
  marketing_pitch: `In order to remain at the forefront of digital commerce, modern enterprises must harness the power of seamless workflow automation. Furthermore, delving into real-time analytics provides a nuanced understanding of consumer behavior. It is crucial to remember that our game-changer platform creates a tapestry of actionable insights. In conclusion, embark on a journey with our solution and experience paramount efficiency.`,
};

export default function AiTextHumanizer() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [tone, setTone] = useState<ToneMode>('casual');
  const [strength, setStrength] = useState<StrengthLevel>('medium');
  const [preserveKeywords, setPreserveKeywords] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor');
  const { isFocusMode, setIsFocusMode } = useFocusMode();

  // Metrics Calculation Helper
  const calculateMetrics = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        words: 0,
        chars: 0,
        sentences: 0,
        avgSentenceLength: 0,
        aiScore: 0,
        readingTime: 0,
        gradeLevel: 'N/A',
        burstiness: 0,
      };
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const chars = text.length;
    const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = Math.max(1, sentences.length);
    const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

    // Sentence length variance (Burstiness)
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const variance =
      lengths.reduce((acc, l) => acc + Math.pow(l - avgSentenceLength, 2), 0) /
      sentenceCount;
    const stdDev = Math.sqrt(variance);
    const burstiness = Math.min(100, Math.round(stdDev * 12));

    // Buzzword density check
    let buzzwordHits = 0;
    AI_PHRASE_DICTIONARY.forEach(item => {
      const matches = text.match(item.pattern);
      if (matches) buzzwordHits += matches.length;
    });

    // Uniform sentence penalty: AI tends to have tight sentence lengths (stdDev < 4)
    let uniformPenalty = 0;
    if (stdDev < 3.5 && sentenceCount > 2) uniformPenalty = 25;
    else if (stdDev < 5 && sentenceCount > 2) uniformPenalty = 15;

    // Formulaic connector penalty
    const formalConnectors = (text.match(/\b(furthermore|moreover|in conclusion|delve|testament|tapestry|holistic|paramount|harness)\b/gi) || []).length;

    // Heuristic AI Likelihood Score (0 to 100)
    let rawScore = Math.min(
      98,
      Math.max(
        5,
        Math.round(
          (buzzwordHits * 18) +
            (formalConnectors * 12) +
            uniformPenalty +
            (avgSentenceLength >= 16 && avgSentenceLength <= 24 ? 15 : 0) -
            (burstiness * 0.3)
        )
      )
    );

    // Flesch-Kincaid Grade Level approximation
    // Syllable count heuristic
    let totalSyllables = 0;
    words.forEach(w => {
      const cleaned = w.toLowerCase().replace(/[^a-z]/g, '');
      if (cleaned.length <= 3) totalSyllables += 1;
      else {
        const matches = cleaned.match(/[aeiouy]{1,2}/g);
        totalSyllables += Math.max(1, matches ? matches.length : 1);
      }
    });

    const fleschGrade = Math.max(
      1,
      Math.min(
        16,
        Math.round(
          0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59
        )
      )
    );

    return {
      words: wordCount,
      chars,
      sentences: sentenceCount,
      avgSentenceLength,
      aiScore: rawScore,
      readingTime: Math.ceil(wordCount / 225),
      gradeLevel: `Grade ${fleschGrade}`,
      burstiness,
    };
  };

  const inputMetrics = useMemo(() => calculateMetrics(inputText), [inputText]);
  const outputMetrics = useMemo(() => calculateMetrics(outputText), [outputText]);

  // Main Humanization Algorithm (100% Client-Side Linguistic Engine)
  const humanizeContent = () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);

    setTimeout(() => {
      let result = inputText;

      // Extract protected keywords
      const keywordsToProtect = preserveKeywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

      // Temporary token placeholders for protected keywords
      const protectedPlaceholders: { token: string; original: string }[] = [];
      keywordsToProtect.forEach((kw, idx) => {
        const token = `__PROTECTED_KW_${idx}__`;
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        result = result.replace(regex, (match) => {
          protectedPlaceholders.push({ token, original: match });
          return token;
        });
      });

      // 1. Buzzword & Robotic Phrase Transformation
      AI_PHRASE_DICTIONARY.forEach((dictItem, dictIdx) => {
        result = result.replace(dictItem.pattern, () => {
          const options = dictItem.replacements[tone] || dictItem.replacements.casual;
          const chosen = options[(dictIdx + inputText.length) % options.length];
          return chosen;
        });
      });

      // 2. Contraction Adjustment based on tone
      if (tone === 'casual' || tone === 'creative' || tone === 'simple') {
        CONTRACTIONS.forEach(([regex, contraction]) => {
          result = result.replace(regex, contraction);
        });
      } else if (tone === 'academic') {
        // Expand contractions for formal/academic writing
        result = result
          .replace(/\bdon't\b/gi, 'do not')
          .replace(/\bdoesn't\b/gi, 'does not')
          .replace(/\bcan't\b/gi, 'cannot')
          .replace(/\bwon't\b/gi, 'will not')
          .replace(/\bit's\b/gi, 'it is')
          .replace(/\bthey're\b/gi, 'they are');
      }

      // 3. Sentence Structure & Burstiness (Vary Sentence Cadence)
      if (strength === 'medium' || strength === 'deep') {
        // Break up monotonous long sentences connected with robotic semicolons or excessive commas
        result = result.replace(/;\s+/g, '. ');

        // Add punchy conversational transition starters for casual / creative mode
        if (tone === 'casual' || tone === 'creative') {
          const conversationalBridges = [
            'Here is the thing:',
            'Look,',
            'To be fair,',
            'In reality,',
            'Truth is,',
          ];
          let sCount = 0;
          result = result.replace(/([.!?]\s+)([A-Z])/g, (match, punct, capLetter) => {
            sCount++;
            if (strength === 'deep' && sCount % 3 === 0 && Math.random() > 0.45) {
              const bridge = conversationalBridges[sCount % conversationalBridges.length];
              return `${punct}${bridge} ${capLetter.toLowerCase()}`;
            }
            return match;
          });
        }
      }

      // 4. Tone Specific Styling
      if (tone === 'simple') {
        // Replace multi-syllabic academic words with everyday vocabulary
        result = result
          .replace(/\bdemonstrate(?:s|d)?\b/gi, 'show')
          .replace(/\bconsequently\b/gi, 'so')
          .replace(/\bsignificant\b/gi, 'big')
          .replace(/\bapproximately\b/gi, 'about')
          .replace(/\bcommence\b/gi, 'start')
          .replace(/\bterminate\b/gi, 'end')
          .replace(/\bcollaborate\b/gi, 'work together');
      } else if (tone === 'professional') {
        // Replace overly academic or overly relaxed words with clear corporate phrasing
        result = result
          .replace(/\bas a matter of fact\b/gi, 'in practice')
          .replace(/\ba whole bunch of\b/gi, 'a key set of')
          .replace(/\btons of\b/gi, 'substantial');
      }

      // 5. Restore Protected Keywords
      protectedPlaceholders.forEach(({ token, original }) => {
        result = result.replace(new RegExp(token, 'g'), original);
      });

      // Capitalize first letter of every sentence cleanly
      result = result.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());

      setOutputText(result.trim());
      setIsProcessing(false);
    }, 280);
  };

  const handleCopy = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = (format: 'txt' | 'md') => {
    if (!outputText) return;
    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `humanized-text.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadSample = (key: keyof typeof SAMPLE_TEXTS) => {
    setInputText(SAMPLE_TEXTS[key]);
    setOutputText('');
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
  };

  return (
    <div className={`space-y-6 ${isFocusMode ? 'fixed inset-0 z-[100] bg-bg-primary p-4 sm:p-8 overflow-y-auto' : ''}`}>
      {/* Header bar in Focus Mode */}
      {isFocusMode && (
        <div className="flex items-center justify-between mb-4 bg-surface border border-border p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-text-primary">AI Text Humanizer</h2>
              <p className="text-xs text-text-muted">Distraction-free humanization workspace</p>
            </div>
          </div>
          <button
            onClick={() => setIsFocusMode(false)}
            className="p-2 hover:bg-bg-secondary rounded-lg text-text-secondary transition-colors"
            title="Exit Focus Mode"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Control Configuration Bar */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            <span className="font-bold text-sm text-text-primary">Humanization Engine Settings</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFocusMode(!isFocusMode)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-bg-secondary hover:bg-border transition-colors text-text-secondary flex items-center gap-1.5"
            >
              {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFocusMode ? 'Normal View' : 'Focus View'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Tone Selector */}
          <div>
            <label className="text-xs font-bold text-text-secondary mb-1.5 block">
              Writing Tone & Cadence
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ToneMode)}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20 font-medium"
            >
              <option value="casual">Casual & Conversational (Warm, Friendly, Contractions)</option>
              <option value="professional">Professional & Executive (Crisp, Business-Ready)</option>
              <option value="academic">Academic & Scholarly (Rigorous, Objective, Formal)</option>
              <option value="creative">Creative & Storyteller (Dynamic Pacing, Narrative)</option>
              <option value="simple">Simple & Plain English (Clear, 8th-Grade Readability)</option>
            </select>
          </div>

          {/* Strength Level */}
          <div>
            <label className="text-xs font-bold text-text-secondary mb-1.5 block">
              Restructuring Strength
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-bg-primary p-1 border border-border rounded-xl">
              {(['light', 'medium', 'deep'] as StrengthLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setStrength(level)}
                  className={`py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                    strength === level
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Preserve Keywords */}
          <div>
            <label className="text-xs font-bold text-text-secondary mb-1.5 block">
              Keep Exact Terms (Comma Separated)
            </label>
            <input
              type="text"
              placeholder="e.g. SEO, Python, LoveYouTools"
              value={preserveKeywords}
              onChange={(e) => setPreserveKeywords(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        {/* Quick Sample Text Loader */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
          <span className="text-text-muted font-medium flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Test with AI Samples:
          </span>
          <button
            onClick={() => handleLoadSample('chatgpt_essay')}
            className="px-2.5 py-1 rounded-md bg-bg-secondary hover:bg-border text-text-secondary font-medium transition-colors"
          >
            ChatGPT Essay
          </button>
          <button
            onClick={() => handleLoadSample('cover_letter')}
            className="px-2.5 py-1 rounded-md bg-bg-secondary hover:bg-border text-text-secondary font-medium transition-colors"
          >
            AI Cover Letter
          </button>
          <button
            onClick={() => handleLoadSample('marketing_pitch')}
            className="px-2.5 py-1 rounded-md bg-bg-secondary hover:bg-border text-text-secondary font-medium transition-colors"
          >
            Marketing Pitch
          </button>
        </div>
      </div>

      {/* Main Two-Column Working Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Input Text Column */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <span className="font-bold text-sm text-text-primary">Input (AI-Generated Text)</span>
              </div>
              {inputText && (
                <button
                  onClick={handleClear}
                  className="text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors"
                >
                  Clear Text
                </button>
              )}
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste ChatGPT, Claude, Gemini, or any AI-generated text here to humanize it..."
              className="w-full h-80 sm:h-96 p-4 text-sm bg-bg-primary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none font-sans leading-relaxed text-text-primary"
            />
          </div>

          {/* Input Metrics & Action */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-4 gap-2 py-2 px-3 bg-bg-primary border border-border rounded-xl text-center text-xs">
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Words</p>
                <p className="font-bold text-text-primary mt-0.5">{inputMetrics.words}</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Avg Sent.</p>
                <p className="font-bold text-text-primary mt-0.5">{inputMetrics.avgSentenceLength}w</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Burstiness</p>
                <p className="font-bold text-text-primary mt-0.5">{inputMetrics.burstiness}</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">AI Likelihood</p>
                <p
                  className={`font-black mt-0.5 ${
                    inputMetrics.aiScore > 65
                      ? 'text-rose-500'
                      : inputMetrics.aiScore > 35
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                  }`}
                >
                  {inputMetrics.aiScore}%
                </p>
              </div>
            </div>

            <button
              onClick={humanizeContent}
              disabled={!inputText.trim() || isProcessing}
              className="w-full py-3.5 px-6 rounded-xl bg-accent hover:opacity-90 active:scale-[0.99] transition-all text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Humanizing Text...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Humanize Content (100% Client-Side)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Output Text Column */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-sm text-text-primary">Humanized Output</span>
                {outputText && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    Bypass Ready
                  </span>
                )}
              </div>

              {outputText && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setViewMode(viewMode === 'editor' ? 'diff' : 'editor')}
                    className="text-xs px-2.5 py-1 rounded-md bg-bg-secondary hover:bg-border text-text-secondary font-semibold transition-colors flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    {viewMode === 'editor' ? 'Show Diff' : 'Standard View'}
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'diff' && outputText ? (
              <div className="w-full h-80 sm:h-96 p-4 text-sm bg-bg-primary border border-border rounded-xl overflow-y-auto font-sans leading-relaxed text-text-primary whitespace-pre-wrap">
                <div className="text-xs text-text-muted mb-2 font-semibold pb-2 border-b border-border">
                  ✨ Humanized Changes Comparison:
                </div>
                {outputText}
              </div>
            ) : (
              <textarea
                readOnly
                value={outputText}
                placeholder="Your humanized, natural-sounding, detection-resistant content will appear here..."
                className="w-full h-80 sm:h-96 p-4 text-sm bg-bg-primary border border-border rounded-xl focus:outline-none resize-none font-sans leading-relaxed text-text-primary"
              />
            )}
          </div>

          {/* Output Metrics & Actions */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-4 gap-2 py-2 px-3 bg-bg-primary border border-border rounded-xl text-center text-xs">
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Words</p>
                <p className="font-bold text-text-primary mt-0.5">{outputMetrics.words}</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Readability</p>
                <p className="font-bold text-text-primary mt-0.5">{outputMetrics.gradeLevel}</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">Burstiness</p>
                <p className="font-bold text-text-primary mt-0.5">{outputMetrics.burstiness}</p>
              </div>
              <div>
                <p className="text-text-muted text-[10px] font-semibold uppercase">AI Likelihood</p>
                <p
                  className={`font-black mt-0.5 ${
                    outputMetrics.aiScore <= 15
                      ? 'text-emerald-500'
                      : outputMetrics.aiScore <= 40
                      ? 'text-amber-500'
                      : 'text-rose-500'
                  }`}
                >
                  {outputText ? `${outputMetrics.aiScore}%` : '0%'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleCopy}
                disabled={!outputText}
                className="py-3 px-4 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
              </button>

              <button
                onClick={() => handleDownload('txt')}
                disabled={!outputText}
                className="py-3 px-4 rounded-xl bg-bg-secondary hover:bg-border text-text-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export (.TXT)</span>
              </button>

              <button
                onClick={() => handleDownload('md')}
                disabled={!outputText}
                className="py-3 px-4 rounded-xl bg-bg-secondary hover:bg-border text-text-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export (.MD)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Highlights & FAQs */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-text-primary flex items-center gap-2">
          <Gauge className="w-5 h-5 text-accent" /> How the 100% Client-Side Humanizer Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-text-secondary leading-relaxed">
          <div className="p-3.5 bg-bg-primary rounded-xl border border-border space-y-1.5">
            <span className="font-bold text-text-primary block">1. Vocabulary Cleansing</span>
            Eliminates formulaic AI tells such as &quot;delve into&quot;, &quot;tapestry&quot;, &quot;furthermore&quot;, &quot;testament to&quot;, replacing them with natural synonyms.
          </div>
          <div className="p-3.5 bg-bg-primary rounded-xl border border-border space-y-1.5">
            <span className="font-bold text-text-primary block">2. Burstiness & Perplexity</span>
            Breaks robotic uniform sentence lengths by weaving punchy clauses and natural cadence favored by human authors.
          </div>
          <div className="p-3.5 bg-bg-primary rounded-xl border border-border space-y-1.5">
            <span className="font-bold text-text-primary block">3. 100% Privacy & Zero API</span>
            All linguistic processing runs strictly on your device inside the web browser. No text is transmitted or logged.
          </div>
        </div>
      </div>
    </div>
  );
}
