import DOMPurify, { type Config } from 'dompurify';

const SAFE_HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
  SANITIZE_NAMED_PROPS: true,
};

const SAFE_METRO_MAP_SVG_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: [
    'script',
    'foreignObject',
    'iframe',
    'object',
    'embed',
    'audio',
    'video',
    'canvas',
    'style',
    'animate',
    'animateMotion',
    'animateTransform',
    'set',
    'discard',
    'mpath',
  ],
};

const INTERNAL_SVG_REFERENCE = /^#[-\w:.]+$/;

function keepOnlyInternalSvgReferences(svg: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return svg;
  }

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');

  document.querySelectorAll('[href], [xlink\\:href]').forEach((element) => {
    const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
    if (!href || INTERNAL_SVG_REFERENCE.test(href)) {
      return;
    }

    element.removeAttribute('href');
    element.removeAttribute('xlink:href');
  });

  return new XMLSerializer().serializeToString(document.documentElement);
}

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, SAFE_HTML_CONFIG);
}

export function sanitizeSvg(dirty: string): string {
  return keepOnlyInternalSvgReferences(DOMPurify.sanitize(dirty, SAFE_METRO_MAP_SVG_CONFIG));
}
