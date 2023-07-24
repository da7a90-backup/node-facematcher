import express from 'express';

import FormData from 'form-data';

import fetch from 'node-fetch';

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

import * as tf from '@tensorflow/tfjs-node';


import * as faceapi from '@vladmandic/face-api';

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
  
      const params = req.query
      const body = req.body
      const code = params.code;
      const imageSrc = body.reference;
  
      console.log(req.headers)
      console.log(imageSrc);
  
  
      console.log(code)
      const formData = new FormData()
      formData.append('client_id', '1695907647592767')
      formData.append('client_secret', 'b55a3a9abdbb392fd561ffec50204e38')
      formData.append('grant_type', 'authorization_code')
      formData.append('redirect_uri', 'https://picstudio-git-da7a90-backup-facematchingdemo-prompthunt.vercel.app/facematchrun')
      //@ts-ignore
      formData.append('code', code)
  
      const token = await fetch('https://api.instagram.com/oauth/access_token', {
        body: formData,
        method: 'POST'
      })
  
      const tokenJson = await token.json();
  
      const accessToken = tokenJson.access_token;
  
      console.log(tokenJson)
  
      let posts = await fetch('https://graph.instagram.com/me/media?fields=id,media_type,media_url,caption&access_token=' + accessToken + '&limit=100')

      let postsJson = await posts.json();
  
      const allPosts = postsJson.data;


      while (postsJson.paging.next) {
        posts = await fetch(postsJson.paging.next)
        postsJson = await posts.json();

        console.log("additional req")
        console.log(postsJson.paging.next)
        console.log("additional posts")
        
        allPosts.push(postsJson.data)
        if (allPosts.length > 300) {
          break;
        }
      }
  
      console.log(allPosts.length);
  
      const images = [];
  
      for (let post of allPosts) {
        if (post.media_type == 'IMAGE') {
          images.push(post.media_url);
        }
        if (post.media_type == 'CAROUSEL_ALBUM') {
          let albumData = await fetch(`https://graph.instagram.com/${post.id}/children?fields=id,media_type,media_url&access_token=${accessToken}`)
          let albumDataJson = await albumData.json()
          for (let albumPost of albumDataJson.data) {
            if (albumPost.media_type == 'IMAGE') {
              images.push(albumPost.media_url);
            }
          }
        }
      }
  
  
      const img = imageSrc.replace(
        /^data:image\/(png|jpeg);base64,/,
        ""
      );
      const b = Buffer.from(img, "base64");
  
      const reference = tf.node.decodeImage(b, 3);

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
        console.log(bestMatch.distance < 0.5 ? "match" : "no match")
        let similarity = (1 - bestMatch.distance) * 100;
        console.log("similarity: " + similarity);
        console.log(i)
  
        if (bestMatch.distance < 0.5) {
          secondImage.width = 800
          secondImage.height = 600
          matchlist.push({ url: i, similarity: "similarity: " + similarity })
        }
      }  
  
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