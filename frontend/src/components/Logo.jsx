import React from 'react';
import '../index.css';

export default function Logo({ variant = 'dark' }) {
    if (variant === 'light') {
        return (
            <div className="logo-light">
                <svg className="icon-light" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="52" height="52" rx="12" fill="rgba(0,100,220,0.08)" />
                    <rect width="52" height="52" rx="12" fill="none" stroke="rgba(0,100,220,0.14)" strokeWidth="1" />
                    <path d="M14 18 L10 26 L14 34" stroke="rgba(0,100,220,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M38 18 L42 26 L38 34" stroke="rgba(0,100,220,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M26 14 L20 28 H26 L22 38" stroke="#0060e0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <circle cx="32" cy="20" r="2" fill="#0095ff" opacity="0.6" />
                    <circle cx="35" cy="26" r="1.5" fill="#0095ff" opacity="0.35" />
                </svg>

                <div className="divider-light"></div>

                <div className="text-group-light">
                    <div className="wordmark-light">
                        <span className="calc-light">Calc</span><span className="ai-light">AI</span>
                    </div>
                    <div className="tagline-light">Smart Pricing Assistant</div>
                </div>
            </div>
        );
    }

    if (variant === 'bold') {
        return (
            <div className="logo-bold">
                <svg className="icon-bold" viewBox="0 0 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Outer hex ring */}
                    <path d="M29 4 L50 16.5 L50 41.5 L29 54 L8 41.5 L8 16.5 Z" fill="rgba(0,149,255,0.07)" stroke="rgba(0,210,255,0.25)" strokeWidth="1" />
                    {/* Inner fill */}
                    <path d="M29 12 L44 20.5 L44 37.5 L29 46 L14 37.5 L14 20.5 Z" fill="rgba(0,149,255,0.12)" />
                    {/* Lightning / cost bolt */}
                    <path d="M32 13 L22 30 H30 L26 45" stroke="url(#boltGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <defs>
                        <linearGradient id="boltGrad" x1="32" y1="13" x2="26" y2="45" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#00d2ff" />
                            <stop offset="100%" stopColor="#0060e0" />
                        </linearGradient>
                    </defs>
                </svg>

                <div className="text-group-bold">
                    <div className="wordmark-bold">
                        <span className="calc-bold">Calc</span>
                        <div className="badge"><span className="badge-text">AI</span></div>
                    </div>
                    <div className="tagline-bold">Azure Smart Pricing Assistant</div>
                </div>
            </div>
        );
    }

    // Default: Dark
    return (
        <div className="logo-dark">
            <svg className="icon-dark" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="52" height="52" rx="12" fill="rgba(0,149,255,0.1)" />
                <rect width="52" height="52" rx="12" fill="none" stroke="rgba(0,149,255,0.2)" strokeWidth="1" />
                {/* calc bracket left */}
                <path d="M14 18 L10 26 L14 34" stroke="rgba(0,149,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {/* calc bracket right */}
                <path d="M38 18 L42 26 L38 34" stroke="rgba(0,149,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {/* spark / dollar symbol */}
                <path d="M26 14 L20 28 H26 L22 38" stroke="#0095ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {/* dot accent */}
                <circle cx="32" cy="20" r="2" fill="#00d4ff" opacity="0.7" />
                <circle cx="35" cy="26" r="1.5" fill="#00d4ff" opacity="0.4" />
            </svg>

            <div className="divider-dark"></div>

            <div className="text-group-dark">
                <div className="wordmark-dark">
                    <span className="calc-dark">Calc</span><span className="ai-dark">AI</span>
                </div>
                <div className="tagline-dark">Smart Pricing Assistant</div>
            </div>
        </div>
    );
}
