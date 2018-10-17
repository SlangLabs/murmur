var fs = require('fs');

var uploaddir = __dirname + '/uploads';  // Upload directory
var directoryToSentence = {};            // dirname to sentence
var language;

// Here's the program:
readConfigFile();
startServer();

/*
 * Synchronous startup stuff before we start handling requests.
 * This reads the sentences.txt configuration file, creates directories
 * as needed, and figures out the next file number in each directory.
 */
function readConfigFile() {
  var configFile = __dirname + '/screenplays.txt';
  var totalItems = 0;
  try {
    fs.readFileSync(configFile, 'utf8')
      .trim()
      .split('\n')
      .forEach(function(line) {
        if(totalItems == 0)
        {
            language = line.trim();
        }
        else{
            var trimmed = line.trim();
            if (trimmed === '' || trimmed[0] === '#') {
              return;  // ignore blanks and comments
            }
        }
        directoryToSentence[totalItems++] = trimmed;
      });
  }
  catch(e) {
    console.error('Error reading configuration file:', configFile,
                  '\n', e);
    process.exit(1);
  }

  if (directoryToSentence.length === 0) {
    console.error('No sentences defined in sentences.txt. Exiting.');
    process.exit(1);
  }

}

function startServer() {
  var LEX = require('letsencrypt-express')/*.testing()*/;
  var http = require('http');
  var https = require('spdy');
  var express = require('express');
  var bodyParser = require('body-parser');
  var AWS = require('aws-sdk')

//  var sqlite3 = require('sqlite3').verbose();

  // Read the server configuration file. It must define
  // letsEncryptHostname and letsEncryptEmailAddress for the
  // certificate registration process
  try {
    var config = JSON.parse(fs.readFileSync('server.conf'));
  }
  catch(e) {
    console.error("Failed to read server.conf:", e);
    console.error("Exiting");
    process.exit(1);
  }
    //TODO: if need arise for storing user data in sqlite db
//  var db = new sqlite3.Database(config.db,  (err) => {
//    if (err) {
//      console.error(err.message);
//
//    } else {
//      console.log('Connected to the user database.');
//
//      let sql = `SELECT * FROM users`;
//
//        db.all(sql, [], (err, rows) => {
//          if (err) {
//            console.log(err + "\n Creating one ...") ;
//            db.serialize(function() {
//                var stmt = db.prepare(
//                  "CREATE TABLE users ( "+
//                  "id integer PRIMARY KEY,"+
//                  "gender text NOT NULL,"+
//                  "age text NOT NULL,"+
//                  "lang1 text NULL," +
//                  "lang2 text NULL)");
//                stmt.run();
//                stmt.finalize();
//            });
//          } else {
//            console.log('Table user exists') ;
//          }
//          // rows.forEach((row) => {
//          //   console.log(row);
//          // });
//
//        });




    //   db.serialize(function() {
    //     var stmt = db.prepare(
    //       "CREATE TABLE users ( "+
    //       "id integer PRIMARY KEY,"+
    //       "gender text NOT NULL,"+
    //       "age text NOT NULL,"+
    //       "lang1 text NULL," +
    //       "lang2 text NULL)");
    //     stmt.run();
    //     stmt.finalize();
    // });

//    }
//  });
  // var db = new sqlite3.Database(':memory:');

  var lex = LEX.create({
    configDir: __dirname + '/letsencrypt.conf',
    // approveRegistration: function (hostname, approve) {
    //   console.log("approveRegistration:", hostname);
    //   if (hostname === config.letsEncryptHostname) {
    //     approve(null, {
    //       domains: [config.letsEncryptHostname],
    //       email: config.letsEncryptEmailAddress,
    //       agreeTos: true
    //     });
    //   }
    // }
  });

  var app = express();

  // Serve static files in the public/ directory
  app.use(express.static('public'));

  // When the client issues a GET request for the list of sentences
  // create that dynamically from the data we parsed from the config file
  app.get('/sentences.json', function(request, response) {
    response.send(directoryToSentence);
  });

  // When we get POSTs, handle the body like this
  app.use(bodyParser.raw({
    type: 'audio/*',
    limit: 1*1024*1024*10  // max file size 10 mb
  }));

  // This is how we handle WAV file uploads
  app.post('/upload/:dir', function(request, response) {
    // user id
    var uid = Math.floor(Math.random() * Date.now())
    // the folder we should write is the sentence hash
    var dir = request.params.dir;
    // the sentence itself
    var sentence = request.headers.sentence

    var extension = '.ogg';  // Firefox gives us opus in ogg
    if (request.headers['content-type'].startsWith('audio/webm')) {
      extension = '.webm';   // Chrome gives us opus in webm
    } else if (request.headers['content-type'].startsWith('audio/mp4a')) {
      extension = '.m4a'; // iOS gives us mp4a
    } else if (request.headers['content-type'].startsWith('audio/wav')) {
      extension = '.wav'; // iOS gives us mp4a
    }

    // if the folder does not exist, we create it
    var folder = uploaddir + "/" + dir + "/";
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
      fs.writeFileSync(folder + '/sentence.txt', sentence);
    }

    var bucketName = process.env.BUCKET_NAME;
    var api_key = process.env.AWS_ACCESS_KEY;
    var secretKey= process.env.AWS_ACCESS_SECRET;

    var s3_path = language+'/' + dir
    var key = s3_path + '/' + uid + extension;
    var sentence_key = s3_path + '/sentence.txt';



    var s3 = new AWS.S3({
        accessKeyId: api_key,
        secretAccessKey: secretKey,
    });

  var params = [{
            Bucket: bucketName,
            Key: sentence_key,
            Body: sentence
        },
        {
            Bucket: bucketName,
            Key: key,
            Body: request.body
        }];

        for(var i=0;i<params.length;i++)
        {
            s3.putObject(params[i], function (perr, pres) {
            if (perr) {
                console.log("Error uploading data: ", perr);
            } else {
                console.log("Successfully uploaded data to myBucket/myKey");
            }
        });
        }
    var path = folder  + uid  + extension;
    fs.writeFile(path, request.body, {}, function(err) {
      response.send('Thanks for your contribution!');
      if (err) {
       return console.warn(err);
      }
      else {

        console.log('wrote file:', path);
      }
    });
  });

    //TODO: if need arise for storing user data in sqlite db
//  app.get('/data/', function(request,response) {
//      db.serialize(function() {
//          var id = Math.floor(Math.random() * Date.now() * (request.headers.gender + request.headers.age + request.headers.langs1 + request.headers.langs2));
//          var stmt = db.prepare("INSERT INTO users VALUES (?,?,?,?,?)");
//          stmt.run(id, request.headers.gender, request.headers.age, request.headers.langs1, request.headers.langs2);
//          stmt.finalize();
//          console.log(id + ' ' + request.headers.gender+ '  ' +  request.headers.age+ '  ' +  request.headers.langs1+ '  ' +  request.headers.langs2);
//          response.send({ uid: id });
//      });
//  });

//    app.get('/data/ios', function(request,response) {
//        db.serialize(function() {
//            var stmt = db.prepare("INSERT INTO users VALUES (?,?,?,?,?)");
//            stmt.run(request.headers.id, request.headers.gender, request.headers.age, request.headers.langs1, request.headers.langs2);
//            stmt.finalize();
//            response  .send({ uid: request.headers.id });
//        });
//    });

  // In test mode, just run the app over http to localhost:8000
  if (process.argv[2] === 'test') {
    app.listen(8000, function() {
      console.log("listening on port 8000");
    });
    return;
  }

  // Redirect all HTTP requests to HTTPS
  http.createServer(LEX.createAcmeResponder(lex, function(req, res) {
    res.setHeader('Location', 'https://' + req.headers.host + req.url);
    res.statusCode = 302;
    res.end('<!-- Please use https:// links instead -->');
  })).listen(config.httpPort || 8080);


  // Handle HTTPs requests using LEX and the Express app defined above
  https.createServer(lex.httpsOptions,
                     LEX.createAcmeResponder(lex, app))
    .listen(config.httpsPort || 443);
}


