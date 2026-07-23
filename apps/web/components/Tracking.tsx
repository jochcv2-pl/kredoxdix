// =============================================================================
// Tracking — Facebook Pixel + Google Analytics
// =============================================================================
// Composant serveur lu dans le <head> du layout racine.
// Si les IDs sont configurés dans Settings (admin CRM), les scripts sont injectés.
// Si les IDs sont vides → aucun script injecté (zéro tracking).
//
// Événements :
//   - PageView (FB) / page_view (GA) → automatique au chargement
//   - Lead (FB) → déclenché par le client sur succès du formulaire (window.fbq('track','Lead'))
// =============================================================================

import { getPublicSetting } from '@/lib/settings';

export async function TrackingHead() {
  // try/catch : si la DB est indispo (build Docker, panne), aucun tracking injecté.
  let fbPixelId = '';
  let gaId = '';
  try {
    [fbPixelId, gaId] = await Promise.all([
      getPublicSetting('fb_pixel_id', ''),
      getPublicSetting('ga_tracking_id', ''),
    ]);
  } catch {
    // DB indispo → zéro tracking (safe default)
  }

  return (
    <>
      {fbPixelId && (
        <>
          {/* Facebook Pixel Code */}
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${fbPixelId}');
fbq('track', 'PageView');`,
            }}
          />
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${fbPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {gaId && (
        <>
          {/* Google Analytics 4 */}
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`,
            }}
          />
        </>
      )}
    </>
  );
}
