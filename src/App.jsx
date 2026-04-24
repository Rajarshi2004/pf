import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

/* ═══════════════════════════════════════
   DATA
   ═══════════════════════════════════════ */
const PROJECTS = [
  {
    id: 'nexus', name: 'NEXUS AI PLATFORM', num: '01',
    desc: 'AI-SaaS tool helping with all sorts of digital tasks. [1K+ USERS]',
    tags: ['React', 'REST API', 'LLM', 'RAG', 'MongoDB'],
    link: 'https://www.nexusaiforu.pro',
    images: ['/assets/nexus/nexus1.png', '/assets/nexus/nexus2.png', '/assets/nexus/nexus3.png','/assets/nexus/nexus4.png' ],
  },
  {
    id: 'fitai', name: 'FIT AI', num: '02',
    desc: 'Self-training AI fitness coach with computer vision rep counting.',
    tags: ['React Native', 'Android Studio', 'Python', 'Database'],
    appNote: 'Android App',
    images: ['/assets/fitai/fitai1.jpg', '/assets/fitai/fitai2.jpg', '/assets/fitai/fitai3.jpg', '/assets/fitai/fitai4.jpg', '/assets/fitai/fitai5.jpg'],
  },
  {
    id: 'upstox', name: 'UPSTOX CHARTS', num: '03',
    desc: 'Real-time stock analytics with interactive chart overlays and indicator application.',
    tags: ['Node.js', 'D3.js', 'YFinance', 'MongoDB'],
    appNote: 'Android App',
    images: ['/assets/upstox/upstox1.png', '/assets/upstox/upstox2.jpeg', '/assets/upstox/upstox3.jpeg', '/assets/upstox/upstox4.jpeg', '/assets/upstox/upstox5.jpeg'],
  },
];

const VIEW_LABELS = [
  '◈ VIEW_01 — INITIAL',
  '◈ VIEW_02 — KEYBOARD REVEAL',
  '◈ VIEW_03 — RIGHT PROFILE',
  '◈ VIEW_04 — BACK PANEL',
  '◈ VIEW_05 — LEFT PROFILE',
  '◈ VIEW_06 — RETURN TO FRONT'
];

/* ═══════════════════════════════════════
   MATH HELPERS
   ═══════════════════════════════════════ */
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);

// Shortest path interpolation for angles (prevents 360 spin when moving from e.g. 350 to 10)
const lerpAngle = (a, b, t) => {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
};

function getPolarToCartesian(r, theta, h) {
  return {
    x: Math.sin(theta) * r,
    y: h,
    z: Math.cos(theta) * r
  };
}

/* ═══════════════════════════════════════
   3D LAPTOP SEQUENCE (6 STAGES)
   ═══════════════════════════════════════ */
function getViews() {
  const isMobile = window.innerWidth < 768;
  const R = isMobile ? 5.5 : 4.4; 
  return [
    // 0: Start of Stage 1 (Centered, Zoomed in Front View)
    { r: 2.8, theta: 0,             h: 1.8, lx: 0, ly: 1.4, lz: 0 },
    // 1: End of Stage 1 / Start of Stage 2 (Slight zoom-in)
    { r: R + 0.2, theta: 0,             h: 0.0, lx: 0, ly: 0.0, lz: 0 },
    // 2: End of Stage 2 / Start of Stage 3 (Keyboard Reveal. Elevated tilt)
    { r: R * 0.8, theta: 0,             h: 2.3, lx: 0, ly: 0.8, lz: 0 },
    // 3: End of Stage 3 / Start of Stage 4 (Right Side View. Drop to low profile)
    { r: R * 0.8, theta: Math.PI / 2,   h: 0.2, lx: 0, ly: 0.0, lz: 0 },
    // 4: End of Stage 4 / Start of Stage 5 (Back View. Orbit back.)
    { r: R * 0.8, theta: Math.PI,       h: 0.2, lx: 0, ly: 0.0, lz: 0 },
    // 5: End of Stage 5 / Start of Stage 6 (Left Side View. Orbit left)
    { r: R * 0.8, theta: Math.PI * 1.5, h: 0.2, lx: 0, ly: 0.0, lz: 0 },
    // 6: End of Stage 6 (Return to Front. Orbit back to start)
    { r: R + 1.2, theta: Math.PI * 2,   h: 0.0, lx: 0, ly: 0.0, lz: 0 }
  ];
}

function Laptop() {
  const { scene } = useGLTF('/model.glb');
  const modelRef = useRef();
  const baseY = useRef(0);

  useEffect(() => {
    if (scene) {
      // Hide the largest flat plane (usually the baked ground plane)
      scene.updateMatrixWorld(true);
      let maxArea = 0;
      let groundNode = null;
      scene.traverse(node => {
        if (node.isMesh) {
          if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
          const geomBox = node.geometry.boundingBox.clone();
          geomBox.applyMatrix4(node.matrixWorld);
          const sz = new THREE.Vector3();
          geomBox.getSize(sz);
          const area = sz.x * sz.z;
          if (area > maxArea) {
             maxArea = area;
             groundNode = node;
          }
        }
      });
      if (groundNode) {
        const sz = new THREE.Vector3();
        groundNode.geometry.boundingBox.clone().applyMatrix4(groundNode.matrixWorld).getSize(sz);
        if (sz.y < 0.2 * Math.max(sz.x, sz.z)) {
          groundNode.visible = false;
        }
      }

      // Compute bounding box ONLY of visible meshes to properly center the laptop itself
      const box = new THREE.Box3();
      scene.traverse(node => {
        if (node.isMesh && node.visible) {
          node.updateWorldMatrix(true, true);
          const geomBox = node.geometry.boundingBox.clone();
          geomBox.applyMatrix4(node.matrixWorld);
          box.union(geomBox);
        }
      });
      const cnt = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      scene.position.sub(cnt);
      const scale = 2.2 / Math.max(sz.x, sz.y, sz.z);
      scene.scale.setScalar(scale);

      scene.updateMatrixWorld(true);
      const box2 = new THREE.Box3();
      scene.traverse(node => {
        if (node.isMesh && node.visible) {
          node.updateWorldMatrix(true, true);
          const geomBox = node.geometry.boundingBox.clone();
          geomBox.applyMatrix4(node.matrixWorld);
          box2.union(geomBox);
        }
      });
      scene.position.y = -box2.getCenter(new THREE.Vector3()).y;
      baseY.current = scene.position.y;
    }
  }, [scene]);

  useFrame(({ clock }) => {
    if (!modelRef.current) return;
    const t = clock.getElapsedTime();
    // Strict vertical float only. No rotation. Laptop stays fixed at origin.
    modelRef.current.position.y = baseY.current + Math.sin(t * 0.9) * 0.025;
    // Set rotation to explicitly face +Z (Front)
    modelRef.current.rotation.y = Math.PI / 2; 
  });

  return <primitive ref={modelRef} object={scene} />;
}

function CameraController({ scrollProgress }) {
  const { camera } = useThree();
  const cur = useRef({ r: 0, theta: 0, h: 0, lx: 0, ly: 0, lz: 0 });

  useFrame(() => {
    const p = scrollProgress.current;
    const views = getViews();
    // 6 stages means 6 intervals => index goes from 0 to 6
    const scaled = p * 6;
    const fi = Math.min(5, Math.floor(scaled));
    const ti = fi + 1;
    // Compress the transition into the first 75% of the scroll block, leaving 25% for a clear, static view
    const localP = (scaled - fi) / 0.75;
    const frac = smoothstep(Math.max(0, Math.min(1, localP)));
    
    const F = views[fi], T = views[ti];
    
    // Smoothly interpolate polar coordinates + lookAt targets
    const tgtR = lerp(F.r, T.r, frac);
    const tgtTheta = lerpAngle(F.theta, T.theta, frac);
    const tgtH = lerp(F.h, T.h, frac);
    const tgtLx = lerp(F.lx, T.lx, frac);
    const tgtLy = lerp(F.ly, T.ly, frac);
    const tgtLz = lerp(F.lz, T.lz, frac);

    const lf = 0.08;
    const c = cur.current;
    c.r = lerp(c.r, tgtR, lf);
    c.theta = lerpAngle(c.theta, tgtTheta, lf);
    c.h = lerp(c.h, tgtH, lf);
    c.lx = lerp(c.lx, tgtLx, lf);
    c.ly = lerp(c.ly, tgtLy, lf);
    c.lz = lerp(c.lz, tgtLz, lf);

    const pos = getPolarToCartesian(c.r, c.theta, c.h);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(c.lx, c.ly, c.lz);
  });

  // Initialize camera position immediately
  useEffect(() => {
    const v = getViews()[0];
    cur.current = { r: v.r, theta: v.theta, h: v.h, lx: v.lx, ly: v.ly, lz: v.lz };
    const pos = getPolarToCartesian(v.r, v.theta, v.h);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(v.lx, v.ly, v.lz);
  }, [camera]);

  return null;
}

function AnimatedKeyLight() {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      ref.current.position.x = Math.sin(t * 0.35) * 3 + 1;
      ref.current.position.z = Math.cos(t * 0.35) * 2 + 1;
    }
  });
  return <pointLight ref={ref} color="#00ffa3" intensity={1.2} distance={12} position={[2, 3, 2]} />;
}

function NeuralNetworkBackground() {
  const count = 300;
  const maxDistance = 9.0;
  const maxLinks = 4000;
  
  const [positions, velocities, linePositions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = [];
    for(let i=0; i<count; i++) {
      pos[i*3] = (Math.random() - 0.5) * 80;
      pos[i*3+1] = (Math.random() - 0.5) * 80;
      pos[i*3+2] = (Math.random() - 0.5) * 60 - 15;
      
      vel.push(new THREE.Vector3((Math.random()-0.5)*0.04, (Math.random()-0.5)*0.04, (Math.random()-0.5)*0.04));
    }
    // Allocate 3x vertices for each link to simulate thickness via jitter
    const lp = new Float32Array(maxLinks * 18);
    return [pos, vel, lp];
  }, []);

  const pointsRef = useRef();
  const linesRef = useRef();

  useFrame(() => {
    if(!pointsRef.current || !linesRef.current) return;
    
    const pos = pointsRef.current.geometry.attributes.position.array;
    for(let i=0; i<count; i++) {
      pos[i*3] += velocities[i].x;
      pos[i*3+1] += velocities[i].y;
      pos[i*3+2] += velocities[i].z;
      
      if (pos[i*3] > 40 || pos[i*3] < -40) velocities[i].x *= -1;
      if (pos[i*3+1] > 40 || pos[i*3+1] < -40) velocities[i].y *= -1;
      if (pos[i*3+2] > 15 || pos[i*3+2] < -45) velocities[i].z *= -1;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    let linkIdx = 0;
    for(let i=0; i<count; i++) {
      for(let j=i+1; j<count; j++) {
        const dx = pos[i*3]-pos[j*3];
        const dy = pos[i*3+1]-pos[j*3+1];
        const dz = pos[i*3+2]-pos[j*3+2];
        const distSq = dx*dx + dy*dy + dz*dz;
        
        if(distSq < maxDistance * maxDistance && linkIdx < maxLinks) {
          const base = linkIdx * 18;
          // Center line
          linePositions[base + 0] = pos[i*3];
          linePositions[base + 1] = pos[i*3+1];
          linePositions[base + 2] = pos[i*3+2];
          linePositions[base + 3] = pos[j*3];
          linePositions[base + 4] = pos[j*3+1];
          linePositions[base + 5] = pos[j*3+2];
          
          // Jitter 1
          const offX = 0.05; const offY = 0.05;
          linePositions[base + 6] = pos[i*3] + offX;
          linePositions[base + 7] = pos[i*3+1] + offY;
          linePositions[base + 8] = pos[i*3+2];
          linePositions[base + 9] = pos[j*3] + offX;
          linePositions[base + 10] = pos[j*3+1] + offY;
          linePositions[base + 11] = pos[j*3+2];
          
          // Jitter 2
          linePositions[base + 12] = pos[i*3] - offX;
          linePositions[base + 13] = pos[i*3+1] - offY;
          linePositions[base + 14] = pos[i*3+2];
          linePositions[base + 15] = pos[j*3] - offX;
          linePositions[base + 16] = pos[j*3+1] - offY;
          linePositions[base + 17] = pos[j*3+2];

          linkIdx++;
        }
      }
    }
    
    linesRef.current.geometry.attributes.position.needsUpdate = true;
    linesRef.current.geometry.setDrawRange(0, linkIdx * 6);
  });

  return (
    <group position={[0, 0, -5]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        </bufferGeometry>
        {/* HDR color pushes intensity past 1 to trigger bloom */}
        <pointsMaterial color={[0, 3, 2]} size={0.35} transparent opacity={0.8} />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={maxLinks * 6} array={linePositions} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={[0, 2.5, 1.6]} transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

function ImageModal({ activeImage, onClose }) {
  useEffect(() => {
    const keyHandler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (activeImage) window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [activeImage, onClose]);

  return (
    <AnimatePresence>
      {activeImage && (
        <motion.div 
          className="image-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img 
            src={activeImage} 
            alt="Full size view" 
            className="image-modal-content"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          />
          <button className="image-modal-close" onClick={onClose}>&times;</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShatterCard({ isVis, children }) {
  return (
    <div className={`shatter-wrapper ${isVis ? 'vis' : 'cracked'}`}>
      <div className="main-card float-card">{children}</div>
      <div className="shards-container">
        <div className="shard shard-tl"><div className="shard-inner float-card">{children}</div></div>
        <div className="shard shard-tr"><div className="shard-inner float-card">{children}</div></div>
        <div className="shard shard-bl"><div className="shard-inner float-card">{children}</div></div>
        <div className="shard shard-br"><div className="shard-inner float-card">{children}</div></div>
        <div className="crack-glow" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   HYBRID PROJECT SECTION (VERTICAL -> HORIZONTAL)
   ═══════════════════════════════════════ */
function ProjectSection({ project, onImageClick }) {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const track = trackRef.current;
      if (!track) return;

      // Ensure ScrollTrigger understands the new bounds
      ScrollTrigger.refresh();

      // Only scroll horizontally the exact distance needed to hide the last card
      const getScrollDist = () => Math.max(0, track.scrollWidth - window.innerWidth + 100);

      gsap.to(track, {
        x: () => -getScrollDist(),
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: true,
          // Horizontal scroll activates ONLY when project section is perfectly pinned locally
          start: 'top top',
          end: () => '+=' + getScrollDist(),
          scrub: 1, // Smooth vertical linkage
          invalidateOnRefresh: true,
          anticipatePin: 1
        }
      });
    }, sectionRef);

    // Give images a moment to load and compute widths correctly
    const t = setTimeout(() => ScrollTrigger.refresh(), 1000);

    return () => {
      ctx.revert();
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="project-section" ref={sectionRef}>
      <div className="project-info">
        <div className="p-num">PROJECT {project.num}</div>
        <h3 className="p-title">{project.name}</h3>
        <p className="p-desc">{project.desc}</p>
        
        {project.link && (
          <a href={project.link} target="_blank" rel="noreferrer" className="p-link">
            VISIT PLATFORM ↗
          </a>
        )}
        {project.appNote && (
          <div className="p-note">◆ {project.appNote}</div>
        )}

        <div className="p-tags" style={{ marginTop: project.link || project.appNote ? '24px' : '0' }}>
          {project.tags.map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
      
      <div className="project-track" ref={trackRef}>
        {project.images.map((img, i) => (
          <div className="project-gallery-card" key={i} onClick={() => onImageClick(img)}>
            <img src={img} alt={`${project.id} screenshot ${i}`} loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperienceSection() {
  const EXPERIENCE = [
    {
      period: 'JAN 2024 – PRESENT',
      role: 'Full-Stack Developer',
      company: 'Freelance · Solo',
      bullets: [
        'Built & deployed 4 AI-powered products , one serving 1K+ users',
        'Architected RAG pipelines, vision models, and real-time APIs',
      ],
    },
    {
      period: 'AUG 2023 – DEC 2023',
      role: 'ML Research Intern',
      company: 'Labmentix',
      bullets: [
        'Built and tested machine learning models with python',
        'Automated data cleaning process with 60% accuracy metrics',
      ],
    },
  ];

  return (
    <section className="exp-section">
      <div className="s-eyebrow">EXPERIENCE</div>
      <h2 className="works-title" style={{ marginBottom: '40px' }}>Where I've<br /><em>Worked</em></h2>
      <div className="exp-grid">
        {EXPERIENCE.map((exp, i) => (
          <motion.div
            key={i}
            className="exp-card"
            initial={{ y: 60, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <div className="exp-period">{exp.period}</div>
            <div className="exp-role">{exp.role}</div>
            <div className="exp-company">{exp.company}</div>
            <ul className="exp-bullets">
              {exp.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function EducationSection() {
  const EDUCATION = [
    {
      period: '2023 – 2027',
      degree: 'B.Tech in Computer Science & Engineering',
      institution: 'University of Engineering & Management, New Town',
      location: 'Kolkata, India'
    },
    {
      period: '2023',
      degree: 'Senior Secondary (ISC)',
      institution: 'Board Examination',
      location: 'Percentage: 90.25%'
    },
    {
      period: 'Pre - 2023',
      degree: 'Secondary (ICSE)',
      institution: 'Board Examination',
      location: ''
    }
  ];

  const CERTIFICATIONS = [
    'Machine Learning Course (Top Performer) – Internshala Trainings',
    'Data Science – British Airways',
    'Data Analytics – Deloitte',
    'Software engineering – JPMorgan Chase & Co.',
    'Product management – Electronic Arts',
    'Advanced System Security – University of Colorado Boulder'
  ];

  return (
    <section className="exp-section" style={{ paddingTop: '0' }}>
      <div className="s-eyebrow">ACADEMICS</div>
      <h2 className="works-title" style={{ marginBottom: '40px' }}>Education &<br /><em>Certifications</em></h2>
      <div className="edu-grid">
        <div className="edu-col">
          <h3 className="section-subtitle">Academic Background</h3>
          <div className="exp-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
            {EDUCATION.map((edu, i) => (
              <motion.div
                key={i}
                className="exp-card"
                initial={{ y: 60, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.7, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                viewport={{ once: true, amount: 0.3 }}
              >
                <div className="exp-period">{edu.period}</div>
                <div className="exp-role">{edu.degree}</div>
                <div className="exp-company">{edu.institution}</div>
                {edu.location && <div className="exp-location" style={{ fontSize: '11px', color: 'rgba(221,232,240,0.55)' }}>{edu.location}</div>}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="edu-col">
          <h3 className="section-subtitle">Certifications</h3>
          <motion.div
            className="exp-card"
            initial={{ y: 60, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <ul className="exp-bullets" style={{ gap: '14px' }}>
              {CERTIFICATIONS.map((cert, i) => (
                <li key={i} style={{ fontSize: '12px' }}>{cert}</li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════ */
export default function App() {
  const scrollProgress = useRef(0);
  const [viewIdx, setViewIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [activeImage, setActiveImage] = useState(null);
  
  // Fake loader just for UX pacing
  useEffect(() => {
    let pct = 0;
    const iv = setInterval(() => {
      pct = Math.min(pct + 2, 88);
      setLoadPct(pct);
    }, 40);
    const timer = setTimeout(() => {
      clearInterval(iv);
      setLoadPct(100);
      setTimeout(() => setLoaded(true), 500);
    }, 2500);
    return () => { clearInterval(iv); clearTimeout(timer); };
  }, []);

  // Update 3D sequence scroll progress (6 Stages -> 600vh height total)
  useEffect(() => {
    const handleScroll = () => {
      const sy = window.scrollY;
      const H = window.innerHeight;
      // 6 stages = 6 intervals = 600vh scrolling distance
      const maxScroll = H * 6; 
      const p = Math.max(0, Math.min(1, sy / maxScroll));
      scrollProgress.current = p;
      // viewIdx determines which text block to show
      const sec = Math.min(5, Math.floor(p * 6));
      if (sec !== viewIdx) setViewIdx(sec);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewIdx]);

  return (
    <>
      <div className={`loading-screen ${loaded ? 'out' : ''}`}>
        <div className="ld-logo">RP</div>
        <div className="ld-track">
          <div className="ld-fill" style={{ width: `${loadPct}%` }} />
        </div>
      </div>

      {/* 3D CANVAS fixed to background */}
      <div className="canvas-container">
        <Canvas camera={{ fov: 45, near: 0.1, far: 100 }} dpr={[1, 2]}>
          <NeuralNetworkBackground />
          <ambientLight intensity={0.4} color="#0d1b2a" />
          <AnimatedKeyLight />
          <pointLight position={[-3, 2, -2]} color="#0077ff" intensity={0.7} distance={10} />
          <React.Suspense fallback={null}>
            <Laptop />
          </React.Suspense>
          <CameraController scrollProgress={scrollProgress} />
          <EffectComposer>
            <Bloom luminanceThreshold={1.2} mipmapBlur intensity={2.0} />
          </EffectComposer>
        </Canvas>
      </div>

      <header className="view-hud">
        <div className="hud-name">RAJARSHI PAUL</div>
        <div className="hud-view">{VIEW_LABELS[viewIdx]}</div>
      </header>

      <div className={`scroll-hint ${viewIdx > 0 ? 'out' : ''}`}>
        <div className="sh-line" />
        <span className="sh-text">SCROLL</span>
      </div>

      {/* ═══ SCROLL SECTIONS (6 stages of story) ═══ */}
      {/* 600vh provides enough scroll depth for the 6 stages. Each text block appears at the right moment. */}
      <div className="scroll-sections-3d">
        {/* Stage 1: Front */}
        <div className="scroll-section align-left">
          <ShatterCard isVis={viewIdx === 0}>
            <div className="c-label">// STAGE 01 — IDENTITY</div>
            <h2>Rajarshi<br />Paul</h2>
            <p style={{ fontWeight: 700 }}>Full-Stack AI Builder</p>
            <p>B.Tech CSE · Kolkata, IN</p>
            <div className="tag-row">
              <span className="tag">SOLO DEV</span>
              <span className="tag">1K+ USERS</span>
            </div>
          </ShatterCard>
        </div>

        {/* Stage 2: Keyboard */}
        <div className="scroll-section align-right">
          <ShatterCard isVis={viewIdx === 1}>
            <div className="c-label">// STAGE 02 — THE ENGINE</div>
            <h2>Hardware &amp;<br />Foundations</h2>
            <p>Where the code hits the metal. Strong roots in low-level architecture, cloud networks, and scalable database design.</p>
          </ShatterCard>
        </div>

        {/* Stage 3: Right Profile */}
        <div className="scroll-section align-left">
          <ShatterCard isVis={viewIdx === 2}>
            <div className="c-label">// STAGE 03 — TECH STACK</div>
            <h2>Core Tech</h2>
            <div className="tech-grid">
              {['React', 'Next.js', 'FastAPI', 'Node.js', 'Python', 'Three.js'].map(t => (
                <span className="t-chip" key={t}>{t}</span>
              ))}
            </div>
          </ShatterCard>
        </div>

        {/* Stage 4: Back view */}
        <div className="scroll-section align-right">
          <ShatterCard isVis={viewIdx === 3}>
            <div className="c-label">// STAGE 04 — BACKBONE</div>
            <h2>Machine<br />Learning</h2>
            <p>Training and deploying reliable Vision and LLM models. TensorFlow, PyTorch, and RAG architectures that scale.</p>
          </ShatterCard>
        </div>

        {/* Stage 5: Left Profile */}
        <div className="scroll-section align-left">
          <ShatterCard isVis={viewIdx === 4}>
            <div className="c-label">// STAGE 05 — MISSION</div>
            <h2>Philosophy</h2>
            <div className="mission-quote">
              "Ship fast. Ship useful. Let AI handle the boring parts."
            </div>
            <p className="c-accent">Building at the intersection of AI × Product.</p>
          </ShatterCard>
        </div>

        {/* Stage 6: Return */}
        <div className="scroll-section align-center">
          <ShatterCard isVis={viewIdx === 5}>
            <div className="c-label">// STAGE 06 — IMPACT</div>
            <h2>Ready to Deploy</h2>
            <p>Explore my recent projects below.</p>
          </ShatterCard>
        </div>
      </div>

      {/* ═══ PROJECTS (Vertical scrolling + Horizontal cards) ═══ */}
      <div className="projects-container">
        <div className="projects-intro">
          <div className="s-eyebrow">SELECTED WORKS</div>
          <h2 className="works-title">Projects<br /><em>Showcase</em></h2>
        </div>

        {PROJECTS.map(proj => (
          <ProjectSection project={proj} key={proj.id} onImageClick={setActiveImage} />
        ))}
      </div>

      {/* ═══ EXPERIENCE & FOOTER ═══ */}
      <div className="post-projects-flow">
        <ExperienceSection />
        <EducationSection />
        
        <footer className="port-footer">
          <span className="ft-name">RAJARSHI PAUL</span>
          <div className="ft-links">
            <a href="mailto:rajarshipaul20@gmail.com">EMAIL</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GITHUB</a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">LINKEDIN</a>
          </div>
        </footer>
      </div>

      <ImageModal activeImage={activeImage} onClose={() => setActiveImage(null)} />
    </>
  );
}
