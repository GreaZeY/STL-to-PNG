import { useState,useEffect } from 'react';
import './App.css';
import axios from 'axios';
import { saveAs } from 'file-saver';

function App() {
const [file, setfile] = useState('');
const [svg, setsvg] = useState('');
  useEffect(async() => {
    var url = `http://localhost:5000/getsvg`
    var formData = new FormData()
    formData.append('file', file)
    console.log(file)
    var config = {
      headers:
      {'Content-Type': 'multipart/form-data'}
    }
    let res=await axios.post(url, formData, config)
   
    console.log(res.data)
    setsvg(res.data.path)
  
      saveAs(res.data.path, "image.svg");
 

  }, [file]);

  const getPng=async ()=>{
    
    if(!file) return
    var url = `http://localhost:5000/getpng`
    var formData = new FormData()
    formData.append('file', file)
    console.log(file)
    var config = {
      headers:
      {'Content-Type': 'multipart/form-data'}
    }
    let res=await axios.post(url, formData, config)
   
    console.log(res.data)
    setsvg(res.data.path)
  
      saveAs(res.data.path, "image.png");
  }
  return (
    <>
    <input type='file' onChange={(e)=>setfile(e.target.files[0])} />
   <button onClick={getPng} >Download Png</button>
    <img src={svg} ></img>
    </>

  );
}

export default App;
