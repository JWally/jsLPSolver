/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/


// //////////////////////////////////////////////////
// name:        "server.js"
// purpose:     "simple server to serve up files for testing"
// notes:       Stolen from here: https://stackoverflow.com/questions/16333790/node-js-quick-file-server-static-files-over-http
//
//
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const port = process.argv[2] || 9000;

http.createServer(function (req, res) {
  console.log(`${req.method} ${req.url}`);

  // parse URL
  var parsedUrl = url.parse(req.url);

  // extract URL path
  let pathname = `.${decodeURI(parsedUrl.pathname)}`;
  // based on the URL path, extract the file extention. e.g. .js, .doc, ...
  const ext = path.parse(pathname).ext;
  // maps file extention to MIME typere
  const map = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword'
  };

  fs.exists(pathname, function (exist) {
    if(!exist) {
      // if the file is not found, return 404
      res.statusCode = 404;
      res.end(`File ${pathname} not found!`);
      return;
    }

    // if is a directory, return contents as json...
    if (fs.statSync(pathname).isDirectory()){
        // pathname += '/index' + ext;
    
        var ret_obj = [];
    
        fs.readdir(pathname, (err, files) => {
          files.forEach(file => {
            ret_obj.push(file);
          });

            // // // // //
            res.setHeader('Content-type', map[".json"] || 'text/plain' );
            res.end(JSON.stringify(ret_obj,null,"    "));
            return 1;

        });
    

        // // // // //
    }

    // read file from file system
    fs.readFile(pathname, function(err, data){
      if(err){
        res.statusCode = 500;
        res.end(`Error getting the file: ${err}.`);
      } else {
        // if the file is found, set Content-type and send data
        res.setHeader('Content-type', map[ext] || 'text/plain' );
        res.end(data);
      }
    });
  });


}).listen(parseInt(port));

console.log(`Server listening on port ${port}`);