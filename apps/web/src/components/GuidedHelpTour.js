import React from 'react';
import { Button } from 'reactstrap';

function tooltipStyle(targetRect, placement = 'bottom') {
  const width = Math.min(360, window.innerWidth - 32);
  const margin = 16;

  if (!targetRect) {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width,
      zIndex: 2002,
    };
  }

  const centeredLeft = Math.min(
    Math.max(margin, targetRect.left + targetRect.width / 2 - width / 2),
    window.innerWidth - width - margin
  );

  const style = {
    position: 'fixed',
    width,
    zIndex: 2002,
  };

  if (placement === 'top') {
    style.left = centeredLeft;
    style.top = Math.max(margin, targetRect.top - 180);
    return style;
  }

  if (placement === 'left') {
    style.top = Math.min(
      Math.max(margin, targetRect.top + targetRect.height / 2 - 90),
      window.innerHeight - 180 - margin
    );
    style.left = Math.max(margin, targetRect.left - width - 16);
    return style;
  }

  if (placement === 'right') {
    style.top = Math.min(
      Math.max(margin, targetRect.top + targetRect.height / 2 - 90),
      window.innerHeight - 180 - margin
    );
    style.left = Math.min(window.innerWidth - width - margin, targetRect.right + 16);
    return style;
  }

  style.left = centeredLeft;
  style.top = Math.min(window.innerHeight - 180 - margin, targetRect.bottom + 16);
  return style;
}

export default function GuidedHelpTour({
  steps = [],
  title = 'Help',
  buttonLabel = 'Help',
  storageKey,
  autoOpenOnce = true,
  className = '',
}) {
  const [open, setOpen] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState(null);

  const currentStep = steps[stepIndex] || null;

  const startTour = React.useCallback(() => {
    setStepIndex(0);
    setOpen(true);
  }, []);

  const updateTarget = React.useCallback(() => {
    if (!currentStep?.selector) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(currentStep.selector);
    if (!element) {
      setTargetRect(null);
      return;
    }

    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    const rect = element.getBoundingClientRect();
    setTargetRect(rect);
  }, [currentStep]);

  React.useEffect(() => {
    if (!autoOpenOnce || !storageKey) {
      return;
    }

    const seenKey = `${storageKey}:seen`;
    if (!window.localStorage.getItem(seenKey)) {
      startTour();
      window.localStorage.setItem(seenKey, '1');
    }
  }, [autoOpenOnce, storageKey, startTour]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    currentStep?.onEnter?.();
    updateTarget();
    const delayed = window.setTimeout(updateTarget, currentStep?.delayMs || 90);
    const onResize = () => updateTarget();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    return () => {
      window.clearTimeout(delayed);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updateTarget, currentStep]);

  if (!steps.length) {
    return null;
  }

  return (
    <>
      <Button
        color="secondary"
        outline
        size="sm"
        className={className}
        onClick={startTour}
      >
        <i className="fas fa-question-circle" style={{ marginRight: 6 }} />
        {buttonLabel}
      </Button>

      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(3, 6, 10, 0.72)',
              zIndex: 2000,
            }}
            onClick={() => setOpen(false)}
            role="presentation"
          />
          {targetRect && (
            <div
              style={{
                position: 'fixed',
                top: targetRect.top - 8,
                left: targetRect.left - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
                border: '2px solid #4fc3f7',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.15)',
                zIndex: 2001,
                pointerEvents: 'none',
              }}
            />
          )}
          <div
            style={{
              ...tooltipStyle(targetRect, currentStep?.placement || 'bottom'),
              background: '#161b22',
              border: '1px solid #30363d',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.35)',
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {title} · korak {stepIndex + 1}/{steps.length}
                </div>
                <div style={{ fontSize: 14, color: '#e6edf3', fontWeight: 700, marginTop: 4 }}>
                  {currentStep?.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 16 }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.7, marginTop: 10 }}>
              {currentStep?.body}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#8b949e' }}>
                {currentStep?.hint || 'Sljedeći korak objašnjava povezano polje ili akciju.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button size="sm" color="secondary" outline disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
                  Back
                </Button>
                {stepIndex < steps.length - 1 ? (
                  <Button size="sm" color="info" onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}>
                    Next
                  </Button>
                ) : (
                  <Button size="sm" color="info" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
