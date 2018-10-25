var fs = require('fs');

var uploaddir = __dirname + '/uploads';  // Upload directory
var directoryToSentence = {};            // dirname to sentence

// Here's the program:
startServer();
/*
 * Synchronous startup stuff before we start handling requests.
 * This reads the sentences.txt configuration file, creates directories
 * as needed, and figures out the next file number in each directory.
 */
function readConfigFile(lang_config_file) {
  var configFile = __dirname + '/' +lang_config_file;
  var totalItems = 0;
  try {
    fs.readFileSync(configFile, 'utf8')
      .trim()
      .split('\n')
      .forEach(function(line) {
        var trimmed = line.trim();
        if (trimmed === '' || trimmed[0] === '#') {
          return;  // ignore blanks and comments
        }

        directoryToSentence[totalItems++] = trimmed;
        //directories.push(directory);
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
  const LEX = require('letsencrypt-express')/*.testing()*/;
  const http = require('http');
  const https = require('spdy');
  const express = require('express');
  const bodyParser = require('body-parser');
  const AWS = require('aws-sdk')
  const uuidv4 = require('uuid/v4');

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

  var lex = LEX.create({
    configDir: __dirname + '/letsencrypt.conf',
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
    var data = JSON.parse(request.headers.user_data);

    // the sentence itself
    var sentence = decodeURI(request.headers.sentence);
    var extension = '.ogg';  // Firefox gives us opus in ogg
    if (request.headers['content-type'].startsWith('audio/webm')) {
      extension = '.webm';   // Chrome gives us opus in webm
    } else if (request.headers['content-type'].startsWith('audio/mp4a')) {
      extension = '.m4a'; // iOS gives us mp4a
    } else if (request.headers['content-type'].startsWith('audio/wav')) {
      extension = '.wav'; // iOS gives us mp4a
    }
    var language = data.language;

    data.text = sentence;

    saveInS3(AWS, uuidv4, request.body, language, extension, data);
    response.send("Uploaded Successfully!")


  });

  app.get('/data/', function(request,response) {

          language = request.headers.selected_language;
          if(language == 'en-IN'){
           lang_config_file = "english.txt";
          }
          else if (language == 'hi-IN'){
            lang_config_file = "hindi.txt";
          }
          readConfigFile(lang_config_file);
          response.send(lang_config_file);
  });


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

function saveInS3(AWS, uuidv4, audio_file, language, extension, data) {

    var date = new Date();
    var day = date.getDate().toString();
    var month = (date.getMonth() + 1) < 10 ? "0"+(date.getMonth() + 1).toString() : (date.getMonth() + 1).toString();
    var year = date.getFullYear().toString();
    var bucketName = process.env.BUCKET_NAME;
    var api_key = process.env.AWS_ACCESS_KEY;
    var secretKey= process.env.AWS_ACCESS_SECRET;
    var uuid  = uuidv4();
    var date_string = year+month+day;

    var path = process.env.S3_PATH;
    var s3_path = path+language +"/" + date_string + "/";
    var audio_key = s3_path + uuid + extension;
    var user_metadata_key = s3_path + uuid + ".json";


    console.log(audio_key, user_metadata_key);
    var s3 = new AWS.S3({
        accessKeyId: api_key,
        secretAccessKey: secretKey,
    });

  var params = [
        {
            Bucket: bucketName,
            Key: audio_key,
            Body: audio_file
        },
        {
            Bucket: bucketName,
            Key: user_metadata_key,
            Body: JSON.stringify(data)
        }];

        for(var i=0;i<params.length;i++)
        {
            s3.putObject(params[i], function (perr, pres) {
            if (perr) {
                console.log("Error uploading data: ", perr);
            } else {
                console.log("Successfully uploaded data to data");
            }
                });
        }

}