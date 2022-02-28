var createSlicer = require('mesh-slice-polygon');
var fs = require('fs');
const ef = require('express-fileupload')
var fsp = require('fs').promises;
var stl = require('stl');
var svg2img = require('svg2img');
const express = require('express')
const https = require('https');


const cors = require('cors');
const height = 4.2

const app = express();
const port = process.env.PORT || 5000
const host = 'localhost'


app.use(express.json())
app.use(cors())
app.use(ef())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use('/storage', express.static('storage'))


app.post('/getsvg', async (req, res) => {
  if (req.files) {
    var efFile = req.files.file
    filename = efFile.name
    try{
      await efFile.mv('./storage/' + filename)
    await main(filename, res)
    res.status(200).json({ path: `http://${host}:${port}/storage/${filename}.svg` });
  
    }catch(err){
      res.status(500).json({
        error:err
      })
    }
  }
})


app.post('/getpng', async (req, res) => {
  if (req.files) {
    try{
    var efFile = req.files.file
    filename = efFile.name

    await efFile.mv('./storage/' + filename)

    await main(filename, res)
    // create png file, and be done
    svg2img(`storage/${filename}.svg`, function (error, buffer) {
      fs.writeFileSync(`storage/${filename}` + '.png', buffer);

    });
    res.status(200).json({ path: `http://${host}:${port}/storage/${filename}.png` });
  }catch(err){
    res.status(500).json({
      error:err
    })
  }
}

})


const main = async (filename) => {
  let svgPaths = '', minX = Number.MAX_VALUE, maxX = 0, minY = Number.MAX_VALUE, maxY = 0;

  const fd = await fsp.open(`storage/${filename}.svg`, "w");

  let result = await convert(`./storage/${filename}`, null, height);
  svgPaths += result.svg;
  minX = Math.min(minX, result.minX)
  minY = Math.min(minY, result.minY)
  maxX = Math.max(maxX, result.maxX)
  maxY = Math.max(maxY, result.maxY)


  // create svg file
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" height="1000" width="1000" viewBox="' + minX + ' ' + minY + ' ' + (maxX - minX) + ' ' + (maxY - minY) + '">';
  svg += svgPaths;
  svg += '</svg>';
  // console.log(svg)
  await fd.write(svg);
  return await fd.close;

}



function convert(file, onDone, height, files) {
  return new Promise((resolve, reject) => {
    var slicer = createSlicer();
    fs.createReadStream(file)
      .pipe(stl.createParseStream())
      .on('data', function (obj) {
        // add an array of vertices
        // [[x, y, z], [x, y, z], [x, y, z]]
        obj && obj.verts && slicer.addTriangle(obj.verts)
      })
      .on('end', async function () {
        // slize at z=height
        var polygons = slicer.slice(height).map(function (polygon) { return polygon.points });

        var svg = await polygonsToSVG(polygons);

        onDone && onDone(files, height);

        resolve(svg);
      });
  });
}

function polygonsToSVG(polygons) {
  // sort from largest to smallest
  polygons = polygons.sort(function (a, b) {
    a.area = a.area || signedArea(a);
    b.area = b.area || signedArea(b);
    if (Math.abs(a.area) > Math.abs(b.area)) return -1;
    if (Math.abs(a.area) < Math.abs(b.area)) return +1;
    return 0;
  });

  var i, j, k, pi, pj;

  // scan the polygons list backwards and find the smallest polygon that has all of current polygon points
  for (i = polygons.length - 1; i > 0; i--) {
    pi = polygons[i];
    for (j = i - 1; j > -1; j--) {
      pj = polygons[j], inside = true;
      for (k = 0; inside && (k < pi.length); k++) {
        inside = pointInsidePolygon(pi[k], pj);
      }
      if (inside) {
        // found it - store it
        pj.children = pj.children || []; pj.children.push(pi);
        break;
      }
    }
  }

  // scan the poly forwards and make sure that children winding is the opposite of parent
  for (i = 0; i < polygons.length - 1; i++) {
    pi = polygons[i];
    var children = pi.children;
    for (j = 0; children && (j < children.length); j++) {
      pj = children[j];
      if (pi.area * pj.area > 0) {
        pj.reverse();
        pj.area *= -1;
      }
    }
  }

  // get the bounds
  //Flip in X & Y at the same time (cutter image should be mirrored, somehow Y was already mirrored)
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  polygons.forEach(function (polygon) {
    polygon.forEach(function (point) {
      point.y = -point.y;
      point.x = -point.x;
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    });
  });


  if (minX > maxX) {
    // we have an empty slice, so just set whatever values
    minX = minY = -100; maxX = maxY = 100;
  }


  var svg = '<path d="';
  polygons.forEach(function (polygon) {
    svg += 'M' + polygon.map(function (point, j) { return (j === 1 ? 'L' : '') + point.x + ' ' + point.y }).join(' ') + ' Z ';
  });
  svg += '" />'

  return { svg: svg, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}




function signedArea(vertices) {
  var j = 0;
  var area = 0;

  for (var i = 0; i < vertices.length; i++) {
    j = (i + 1) % vertices.length;

    area += vertices[i].x * vertices[j].y;
    area -= vertices[i].y * vertices[j].x;
  }

  return area * 0.5;
}


function pointInsidePolygon(point, vs) {
  var x = point.x, y = point.y;

  var inside = false;
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    var xi = vs[i].x, yi = vs[i].y;
    var xj = vs[j].x, yj = vs[j].y;

    var intersect = ((yi > y) != (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}


app.listen(port, () => {
  console.log(`Server : http://${host}:${port}`)
});