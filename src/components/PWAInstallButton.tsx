import React, { useState } from 'react';
import { Smartphone, Monitor, X, Share, PlusSquare, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'hero' }> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          onClick={handleInstallClick}
          className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install Mobile / PC App</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className="px-5 py-3 text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 rounded-xl shadow-md transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          <span>मोबाईल ॲप इन्स्टॉल करा (Install App)</span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold">
                  मोबाईल आणि कॉम्प्युटरवर ॲप कसे इन्स्टॉल करावे?
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-700">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="font-bold text-indigo-950">iPhone / iPad (Safari Browser):</div>
                  <p className="flex items-center gap-2">
                    1. खालील <strong>Share</strong> <Share className="w-4 h-4 inline text-indigo-600" /> बटनावर क्लिक करा.
                  </p>
                  <p className="flex items-center gap-2">
                    2. खाली स्क्रोल करून <strong>Add to Home Screen</strong> <PlusSquare className="w-4 h-4 inline text-indigo-600" /> निवडा.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-700">
                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-indigo-600" />
                    <span>Android Mobile (Chrome Browser):</span>
                  </div>
                  <p>
                    1. हे पोर्टल मोबाईलच्या <strong>Chrome Browser</strong> मध्ये उघडा (नवीन टॅबमध्ये उघडा).
                  </p>
                  <p>
                    2. उजव्या कोपऱ्यातील <strong>3 Dots (⋮)</strong> वर क्लिक करा आणि <strong>"Install App"</strong> किंवा <strong>"Add to Home screen"</strong> वर क्लिक करा.
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-emerald-600" />
                    <span>Computer / Laptop (Chrome किंवा Edge):</span>
                  </div>
                  <p>
                    वरच्या URL बारच्या उजव्या बाजूला असलेल्या <strong>Install Icon (компьюटर चिन्ह)</strong> वर क्लिक करून तुम्ही कॉम्प्युटरवरही डायरेक्ट सॉफ्टवेअरप्रमाणे इन्स्टॉल करू शकता.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> दोन्ही इंजिनियरसाठी एकाच लिंकवरून चालेल
              </span>
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 cursor-pointer"
              >
                समजले (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
