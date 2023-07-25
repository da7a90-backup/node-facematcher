import express from 'express';

import axios from 'axios';

import https from "https";

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import fs from "fs";

const downloadFile = async (url) => {
  const req = await axios.get(
    url,
    { responseType: 'arraybuffer' });
  return req.data;
};

import * as tf from '@tensorflow/tfjs-node-gpu';


import * as faceapi from '@vladmandic/face-api/dist/face-api.node-gpu.js';

import cors from 'cors';


const app = express();

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));

app.use(cors())

app.get('/.well-known/pki-validation/238E2C4BC3DCCBA2B40CAE1EB740FDBF.txt', async (req, res)=>{


  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const options = {
    root: join(__dirname)
};

const fileName = '238E2C4BC3DCCBA2B40CAE1EB740FDBF.txt';
res.sendFile(fileName, options, function (err) {
    if (err) {
        next(err);
    } else {
        console.log('Sent:', fileName);
    }
});

})

app.post('/facematch', async (req, res)=>{

    await tf.setBackend('tensorflow');
    await tf.ready();
    try {
  
      const MODEL_URL = `./face-detector/model`;
  
      const modelsLoaded = Promise.all([faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL),
      faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL)
      ])
      await modelsLoaded
  
      const body = req.body
      const imageSrc = body.reference;
      const images = body.images
  
  
      const img = await downloadFile(imageSrc);
  
      const reference = tf.node.decodeImage(img, 3);

      console.log("loaded")
      console.log(images.length)
  
      const singleResult = await faceapi
        .detectSingleFace(reference)
        .withFaceLandmarks()
        .withFaceDescriptor()
      if (!singleResult) {
        console.log("no face detected")
        return res.status(400).json({ message: "no face detected" });
      }
      let matchlist = []
      for (let i of images) {
        console.log("treating: " + images.indexOf(i))
        const secondImageRes = await downloadFile(i);
        //@ts-ignore
        let secondImage = tf.node.decodeImage(secondImageRes, 3);
  
        const results = await faceapi
          .detectAllFaces(secondImage)
          .withFaceLandmarks()
          .withFaceDescriptors()
  
        // If there is no face, return error
        if (results.length === 0) {
          console.log('Could not detect face');
          continue;
        }
  
        // create FaceMatcher with automatically assigned labels
        // from the detection results for the reference image
        const faceMatcher = new faceapi.FaceMatcher(results)
  
        const bestMatch = faceMatcher.findBestMatch(singleResult.descriptor)

        console.log(bestMatch.distance < 0.55 ? "match" : "no match")
        let similarity = (1 - bestMatch.distance) * 100;
        console.log("similarity: " + similarity);
  
        if (bestMatch.distance < 0.55) {
          if(results.length === 1){
          matchlist.push({boxes : [], url: i, similarity: "similarity: " + similarity })
        } else {
          let boxes = [];
          for(let result of results){
            let secondFaceMatcher = new faceapi.FaceMatcher(result)
            let secondBest = secondFaceMatcher.findBestMatch(singleResult.descriptor)
            if(secondBest.distance > 0.55){
              boxes = [...boxes, result.detection.box]
            }
          }
          matchlist.push({boxes : boxes, url: i, similarity: "similarity: "+ similarity})
        }
        }
      }  
  
      console.log("returned: ")
      console.log(matchlist)
      return res.status(200).json({ matchlist: matchlist })
  
    } catch (e) {
      console.error({ e });
      return res.status(500).json({
        message: `Error`,
        status: 500
      });
    }

})

https
  .createServer(
		// Provide the private and public key to the server by reading each
		// file's content with the readFileSync() method.
    {
      key: fs.readFileSync("private.key"),
      cert: fs.readFileSync("certificate.crt"),
    },
    app
  )
  .listen(80, () => {
    console.log("server is runing at port 80");
  });