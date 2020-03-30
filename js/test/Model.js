const assert = require('assert')
const { GallerySeq, ImageCache, PhotoItem, Placeholder } = require('../src/Model')

function shouldMergeGalleryProperly() {
        var gallery = GallerySeq.fromList([new PhotoItem('photo1', cache),
                                           new PhotoItem('photo2', cache),
                                           new Placeholder(20, 100)])

        var [ before, middle, after ] =
            gallery.mergeHelper(GallerySeq.fromList([new PhotoItem('photo2', cache),
                                                     new PhotoItem('photo3', cache)]))

        var [ a, b ] = middle.toList()

        assert(a instanceof PhotoItem)
        assert(a.id == 'photo2')

        assert(b instanceof PhotoItem)
        assert(b.id == 'photo3')

        var [ c ] = after.toList()

        assert(c instanceof Placeholder)
        assert(c.count == 19)
    })
})

export default function() {
    shouldMergeGalleryProperly()
}
