/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SITE CONTENT — the one file to edit.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Everything the room displays (TV, notepad, computer terminal, résumé sheet,
 *  contact card, CD player, reading version) is generated from this file.
 *
 *  Sources: the résumé PDF (126176071_Nithishhariharan.M.pdf, copied to
 *  /public/resume/), the CKD project presentation (assets-src/2nd review.pptx)
 *  and the demo recordings in assets-src/. Nothing here is invented. Anything
 *  not supplied is marked `placeholder: true` and shown with a visible
 *  "placeholder" marker until real material arrives.
 *
 *  Media: put files in /public/media/<project-id>/ (scripts/encode-media.mjs
 *  prepares the supplied recordings) and list them below:
 *  { type: 'video', src, poster? } (MP4/WebM; muted on the CRT unless the
 *  visitor has sound on) or { type: 'image', src }. Captions should describe
 *  what is on screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Link = { label: string; href: string; placeholder?: boolean }

export type Media =
  | { type: 'video'; src: string; poster?: string; caption?: string }
  | { type: 'image'; src: string; caption?: string }

export type Project = {
  /** URL slug, e.g. /#/work/escrochain */
  id: string
  /** Full title (notepad, reading version) */
  title: string
  /** Short title for the tape spine / list */
  short: string
  /** One-line summary shown under the title */
  summary: string
  /** What you personally did (bullet list) */
  contribution: string[]
  /** Team / context line, e.g. who you built it with */
  team?: string
  /** Outcomes stated in the supplied material */
  results?: string[]
  tech: string[]
  links: Link[]
  /** Period such as "2024" — leave '' if unknown (never guessed) */
  period: string
  media: Media[]
  /** Tape shell colour + label accent */
  tape: { shell: string; accent: string; label: string; tag: string }
  /** true while the entry is waiting for real material */
  placeholder?: boolean
  /** which fields are placeholders (shown with a marker) */
  placeholderFields?: Array<'summary' | 'contribution' | 'tech' | 'links' | 'media' | 'period'>
}

export type Track = {
  title: string
  artist: string
  /** Audio file (MP3/OGG/M4A) in /public/audio, streamed through the desk speakers. Without it a generated tune is used. */
  src?: string
  /** Seed/style for the generated placeholder tune */
  generated?: { key: number; bpm: number; mood: 'rain' | 'dusk' | 'late' }
  placeholder?: boolean
}

export const site = {
  name: 'Nithishhariharan M',
  /** How the name is split on the TV title card (purely typographic) */
  titleLines: ['NITHISHHARIHARAN M'],
  location: 'Thanjavur, India',
  /** Short line under the name on the TV — wording taken from the résumé summary */
  tagline: 'Software · VR simulations · Blockchain systems',
  /** Used for <meta name="description"> */
  description:
    'Nithishhariharan M — student developer working on software, VR simulations and blockchain systems. An interactive desk at night: pick a tape to see the work.',

  about: {
    heading: 'About me',
    /** Paragraphs for the computer terminal + reading version (from the résumé summary) */
    paragraphs: [
      'Tech-driven and motivated student skilled in software development, VR simulations, and blockchain systems.',
      'Always exploring new tools to build efficient and meaningful digital solutions.',
    ],
    interests: [
      'Designing user interfaces and interactive systems',
      'Developing games and VR simulations using Unity',
      'Exploring modern front-end frameworks like React and Vue',
    ],
    skills: [
      { label: 'Languages', items: ['Java', 'C++'] },
      { label: 'Frontend', items: ['React.js'] },
      { label: 'Database', items: ['MySQL'] },
      { label: 'Blockchain', items: ['Solidity (basic)'] },
      { label: 'Web3 tools', items: ['ethers.js', 'MetaMask'] },
      { label: 'VR / XR', items: ['Unity Engine', 'XR Interaction Toolkit'] },
      { label: 'Tools', items: ['Git', 'GitHub', 'VS Code'] },
    ],
    education: [
      {
        school: 'SASTRA Deemed University, Thanjavur',
        degree: 'Master of Computer Applications (MCA)',
        period: 'Present',
        note: 'CGPA 7.44 (till 3rd semester)',
      },
      {
        school: 'PMIST University, Thanjavur',
        degree: 'Bachelor of Computer Applications (BCA)',
        period: '2021–2024',
        note: '',
      },
      {
        school: 'Maxwell Matriculation Higher Secondary School, Thanjavur',
        degree: 'HSC 75.83% (batch 2021) · SSLC 64% (batch 2019)',
        period: '2019–2021',
        note: '',
      },
    ],
  },

  projects: [
    {
      id: 'hemodialysis-vr',
      title: 'Hemodialysis VR Training Simulator',
      short: 'Hemodialysis VR',
      summary: 'An immersive VR simulation replicating real hemodialysis procedures, for medical learning and demonstration.',
      contribution: [
        'Developed an immersive VR simulation replicating real hemodialysis procedures.',
        'Implemented machine operations, fluid flow systems, and XR-based interactions.',
        'Designed realistic visuals for medical learning and demonstration.',
      ],
      tech: ['Unity', 'C#', 'XR Interaction Toolkit'],
      links: [{ label: 'github.com/nithish008888/HemodialysisVR', href: 'https://github.com/nithish008888/HemodialysisVR' }],
      period: '',
      media: [
        {
          type: 'video',
          src: '/media/hemodialysis-vr/demo.mp4',
          poster: '/media/hemodialysis-vr/poster.jpg',
          caption: 'Simulator walkthrough, recorded in the Unity editor (XR Device Simulator)',
        },
        { type: 'image', src: '/media/hemodialysis-vr/patient.jpg', caption: 'Patient and dialysis machine in the training room' },
        { type: 'image', src: '/media/hemodialysis-vr/priming.jpg', caption: 'Machine setup: priming the dialysis machine' },
      ],
      tape: { shell: '#0f5f66', accent: '#2fd3c6', label: '#f2efe6', tag: 'VR · UNITY' },
    },
    {
      // From the project presentation ("2nd review"): final-year project, School of Computing.
      id: 'ckd-screening-vr',
      title: 'CKD screening and VR integration',
      short: 'CKD + VR',
      summary:
        'Machine-learning screening for chronic kidney disease risk in elderly patients, running live inside the VR hemodialysis training simulator.',
      contribution: [
        'Collected and preprocessed the NHANES data (merging records, missing values, normalisation).',
        'Designed the prediction model: logistic regression on age, BUN, uric acid and UHR.',
        'Converted the trained model to ONNX in Google Colab.',
        'Integrated it into Unity with Sentis (CKDPredictor.cs) for real-time prediction in VR.',
      ],
      team: 'Final-year project with Navena RK',
      results: [
        'AUC 0.886 on the internal test set, 0.861 on a later NHANES cohort',
        'Low / medium / high risk tiers; high risk opens the hemodialysis simulation',
        'Predictions in Unity checked against Python (onnxruntime)',
      ],
      tech: ['Python', 'scikit-learn', 'ONNX', 'Unity Sentis', 'Unity', 'C#'],
      links: [],
      period: '2026',
      media: [
        {
          type: 'video',
          src: '/media/ckd-screening-vr/demo.mp4',
          poster: '/media/ckd-screening-vr/poster.jpg',
          caption: 'CKD risk assessment in VR, recorded in the Unity editor',
        },
        { type: 'image', src: '/media/ckd-screening-vr/assessment.jpg', caption: 'Age, BUN, uric acid and UHR are set with + / − controls in VR' },
        { type: 'image', src: '/media/ckd-screening-vr/high-risk.jpg', caption: 'High risk (over 50%) leads into the hemodialysis simulation' },
        { type: 'image', src: '/media/ckd-screening-vr/pipeline.jpg', caption: 'From NHANES data to an ONNX model running in Unity Sentis' },
        { type: 'image', src: '/media/ckd-screening-vr/roc.jpg', caption: 'ROC curves: internal test set and external validation' },
      ],
      tape: { shell: '#c4581b', accent: '#ffd166', label: '#f4efe2', tag: 'ML · VR' },
    },
    {
      id: 'escrochain',
      title: 'EscroChain',
      short: 'EscroChain',
      summary: 'A decentralized escrow protocol: a blockchain-based escrow system enabling secure, trustless fund transfers.',
      contribution: [
        'Built a blockchain-based escrow system enabling secure, trustless fund transfers.',
        'Used Solidity smart contracts to enforce escrow logic such as staking, cancellation, and confirmation before fund release.',
        'Created a browser-based interface for initiating and tracking transactions.',
      ],
      tech: ['React', 'JavaScript ES6+', 'ethers.js', 'Solidity'],
      links: [{ label: 'github.com/nithish008888/EscroChain', href: 'https://github.com/nithish008888/EscroChain' }],
      period: '',
      media: [
        {
          type: 'video',
          src: '/media/escrochain/demo.mp4',
          poster: '/media/escrochain/poster.jpg',
          caption: 'Creating an escrow contract and staking with MetaMask (Polygon Mumbai testnet)',
        },
      ],
      tape: { shell: '#3b1f78', accent: '#b39dff', label: '#f1eef8', tag: 'WEB3 · SOLIDITY' },
    },
  ] satisfies Project[] as Project[],

  resume: {
    /** The supplied PDF (copied from the project root) */
    pdf: '/resume/Nithishhariharan-M-Resume.pdf',
    fileName: 'Nithishhariharan-M-Resume.pdf',
  },

  contact: {
    email: 'Nith9677@gmail.com',
    links: [
      { label: 'GitHub', href: 'https://github.com/nithish008888' },
      { label: 'Email', href: 'mailto:Nith9677@gmail.com' },
    ] as Link[],
    /** In the résumé but hidden on the site by default — set show: true to publish */
    phone: { value: '+91 86676 72404', show: false },
    /** Listed on the résumé; it is the previous portfolio, so not linked by default */
    previousSite: { href: 'https://nithish007.netlify.app', show: false },
    /** Not supplied yet: add e.g. { label: 'LinkedIn', href: 'https://www.linkedin.com/in/…' } to links */
  },

  /** Set dressing only (brand names printed on the props, the wall poster). Not claims about anyone. */
  decor: {
    tvBrand: 'NITHISH',
    tvModel: 'Kaveri',
    vcrBrand: 'THANJAI',
    pcBrand: 'chola',
    pcModel: 'PC/86 · MONOCHROME',
    /** The wall poster: the owner's photo with "ME" */
    poster: { photo: '/images/me.jpg', big: 'ME', small: 'NITHISHHARIHARAN M · THANJAVUR' },
  },

  music: {
    disc: 'Night Desk Mix',
    note: 'Lo-fi loops generated in your browser, playing through the desk speakers.',
    /**
     * Copyright-free loops generated in the browser. To use a real track, put the file in /public/audio/ and add
     * e.g. { title: 'My Song', artist: 'Me', src: '/audio/my-song.mp3' } — only music you have the rights to publish
     * (the commercial song supplied earlier is kept locally in assets-src/music.mp3 and is not published).
     */
    tracks: [
      { title: 'Monsoon Window', artist: 'Generated', generated: { key: 2, bpm: 74, mood: 'rain' } },
      { title: 'Sodium Lights', artist: 'Generated', generated: { key: 9, bpm: 82, mood: 'dusk' } },
      { title: 'Tape Hiss', artist: 'Generated', generated: { key: 5, bpm: 68, mood: 'late' } },
    ] as Track[],
  },
} as const

export type Site = typeof site
export const projects: Project[] = site.projects
export const projectById = (id: string | null | undefined) => projects.find((p) => p.id === id) ?? null
