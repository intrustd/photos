import { calcIdealImageSize } from './Util.js';
import { round, ratio } from './utils/ratio';
import { findShortestPath } from './utils/dijkstra';

const TEXT_BORDER = 1
export const TEXT_PADDING = 15 + TEXT_BORDER
export const TEXT_VERTICAL_MARGIN = 20 + TEXT_PADDING
export const TEXT_HORIZONTAL_MARGIN = 40 + TEXT_PADDING

// guesstimate how many neighboring nodes should be searched based on
// the aspect ratio of the container with images having an avg AR of 1.5
// as the minimum amount of photos per row, plus some nodes
export const findIdealNodeSearch = ({ targetRowHeight, containerWidth }) => {
  const rowAR = containerWidth / targetRowHeight;
  return round(rowAR / 1.5) + 8;
};

// compute sizes by creating a graph with rows as edges and photo to break on as nodes
// to calculate the single best layout using Dijkstra's findShortestPat

// get the height for a set of photos in a potential row
const getCommonHeight = (row, containerWidth, margin) => {
    const rowWidth = containerWidth - row.length * (margin * 2);
    const totalAspectRatio = row.reduce((acc, photo) => acc + ratio(photo.description), 0);
    return rowWidth / totalAspectRatio;
};

// calculate the cost of breaking at this node (edge weight)
const cost = (photos, i, j, width, targetHeight, margin) => {
  const row = photos.slice(i, j);
  const commonHeight = getCommonHeight(row, width, margin);
  return Math.pow(Math.abs(commonHeight - targetHeight), 2);
};

// return function that gets the neighboring nodes of node and returns costs
const makeGetNeighbors = (targetHeight, containerWidth, photos, limitNodeSearch, margin) => start => {
  const results = {};
  start = +start;
  results[+start] = 0;
  for (let i = start + 1; i < photos.length + 1; ++i) {
    if (i - start > limitNodeSearch) break;
    results[i.toString()] = cost(photos, start, i, containerWidth, targetHeight, margin);
  }
  return results;
};

export const computeRowLayout = ({ containerWidth, limitNodeSearch, targetRowHeight, margin, photos }) => {
    // const t = +new Date();
    const { PhotoItem, TextItem, Placeholder, Row, GallerySeq } = require('./Model.js')
    const getNeighbors = makeGetNeighbors(targetRowHeight, containerWidth, photos, limitNodeSearch, margin);
    let path = findShortestPath(getNeighbors, '0', photos.length);
    path = path.map(node => +node);

    var acc = []
    for (let i = 1; i < path.length; ++i) {
        const row = photos.slice(path[i - 1], path[i]);
        var height = getCommonHeight(row, containerWidth, margin);
        const firstIndex = path[i - 1]

        if ( height > (targetRowHeight * 2) )
            height = targetRowHeight // Force a bad break if the height gets out of hand

        acc.push(new Row(height))

        for (let j = path[i - 1]; j < path[i]; ++j) {
            var photo = photos[j]
            var photoDesc = photo.description

            var width = (height / photoDesc.height) * photoDesc.width

            var idealSize = calcIdealImageSize(width, height)
            if ( photoDesc.image ) {
                photoDesc.image.atSize(idealSize)
            }
            acc.push(photo)
        }
    }

    return acc;
};

function measureText(width, text) {
    var textDiv = document.createElement('div')
    textDiv.style.position = 'absolute';
    textDiv.style.top = '0';
    textDiv.style.left = '0';
    textDiv.style.width = `${width - 2*TEXT_HORIZONTAL_MARGIN}px`;
    textDiv.appendChild(document.createTextNode(text))

    document.body.appendChild(textDiv)

    var ht = textDiv.offsetHeight + 2 * TEXT_VERTICAL_MARGIN

    document.body.removeChild(textDiv)

    return ht
}

export function justifiedLayout(gallery, width, targetRowHeight, margin) {
    const { PhotoItem, Placeholder, TextItem, Row, GallerySeq } = require('./Model.js')
    var photos = []
    var acc = GallerySeq.fromList([])

    const limitNodeSearch = findIdealNodeSearch({ targetRowHeight,
                                                  containerWidth: width })
    const flushPhotos = () => {
        if ( photos.length > 0 ) {
            var row = computeRowLayout({ containerWidth: width,
                                         limitNodeSearch,
                                         targetRowHeight, margin, photos})
            acc = GallerySeq.concat(acc, GallerySeq.fromList(row))
            photos = []
        }
    }

    while ( true ) {
        var res = gallery.viewl()
        if ( res === undefined || res.length == 0 ) {
            flushPhotos()
            break
        }

        var [ item, nextGallery ] = res

        if ( item instanceof Row ) {
            gallery = nextGallery
            continue
        }

        if ( item instanceof Placeholder ) {
            flushPhotos()
            acc = acc.append(item)
        }

        if ( item instanceof TextItem ) {
            flushPhotos()
            var height = measureText(width, item.text)
            item = item.withHeight(height)
            acc = acc.append(item)
        }

        if ( item instanceof PhotoItem ) {
            photos.push(item)
        }

        gallery = nextGallery
    }

    flushPhotos()
    return acc
}
