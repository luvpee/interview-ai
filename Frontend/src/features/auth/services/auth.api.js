import axios from "axios"

//axios instance for removing redundancy in code
const api = axios.create({
  baseURL: "http://localhost:3000",
  //Server can read/set data with cookies, axios by default dont allow that
  withCredentials: true,
})

export async function register({username,email,password}){
  const response = await api.post('/api/auth/register', {
    username,email,password
  })
  return response.data;
}

export async function login({email,password}){
  const response = await api.post("/api/auth/login", {email,password})
  return response.data;
}

export async function logout(){
  try{
    const response=await api.get("/api/auth/logout"
    )
    return response.data;
  }catch(err){
    console.log(err);
  }
}

export async function getMe(){
  try{
    const response= await api.get("/api/auth/get-me"
    )
    return response.data;
  }catch(err){
    console.log(err);
  }
}
