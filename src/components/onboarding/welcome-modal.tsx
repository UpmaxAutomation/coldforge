'use client'
import { useState } from 'react'

export function WelcomeModal({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const steps = [
    { title: 'Welcome to InstantScale', description: 'Let\'s get you set up in just a few steps.' },
    { title: 'Connect Email', description: 'Add your first email account to start sending.' },
    { title: 'Import Leads', description: 'Upload your contacts or add them manually.' },
    { title: 'Create Campaign', description: 'Set up your first email sequence.' }
  ]

  const currentStep = steps[step]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold">{currentStep?.title}</h2>
        <p className="mt-2 text-muted-foreground">{currentStep?.description}</p>
        <div className="mt-6 flex justify-between">
          {step > 0 && <button onClick={() => setStep(s => s - 1)}>Back</button>}
          <button onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onComplete()} className="ml-auto px-4 py-2 bg-primary text-white rounded">
            {step < steps.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  )
}
