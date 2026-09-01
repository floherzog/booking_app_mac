import { Node, mergeAttributes } from '@tiptap/core'

// Email clients cannot play an embedded video, so a "video" in a template is
// really a clickable thumbnail: an image (stored like any other inline asset)
// wrapped in a link, plus a visible "watch" line for clients that block images.
// Defined here in core so the editor and the email renderer agree on the markup.
//
// Each attribute renders as a data-* attribute and parses back from it, which
// keeps the HTML round-trippable and stops TipTap emitting the raw attribute
// names onto the element.
export const VideoLink = Node.create({
  name: 'videoLink',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: el => el.getAttribute('data-video-link') || '',
        renderHTML: attrs => ({ 'data-video-link': attrs.url || '' }),
      },
      // An asset id from templates:saveAsset, same namespace as inline images.
      thumbAssetId: {
        default: '',
        parseHTML: el => el.getAttribute('data-thumb-asset') || '',
        renderHTML: attrs => (attrs.thumbAssetId ? { 'data-thumb-asset': attrs.thumbAssetId } : {}),
      },
      label: {
        default: '▶ Watch video',
        parseHTML: el => el.getAttribute('data-label') || '▶ Watch video',
        renderHTML: attrs => ({ 'data-label': attrs.label || '▶ Watch video' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-video-link]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const url = node.attrs.url || ''
    const thumb = node.attrs.thumbAssetId || ''
    const label = node.attrs.label || '▶ Watch video'

    const linkChildren = []
    if (thumb) {
      // booking-asset:// is rewritten to a cid: reference by renderEmailHtml,
      // exactly like a plain inline image.
      linkChildren.push(['img', { src: `booking-asset://${thumb}`, alt: label }])
    }
    linkChildren.push(['span', { class: 'booking-video-label' }, label])

    return ['div', mergeAttributes(HTMLAttributes), ['a', { href: url }, ...linkChildren]]
  },

  addCommands() {
    return {
      setVideoLink: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    }
  },
})
