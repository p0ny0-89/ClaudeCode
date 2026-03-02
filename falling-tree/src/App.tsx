import { ProjectProvider, useProject } from './context/ProjectContext'
import VideoUpload from './components/VideoUpload'
import ModeRouter from './components/ModeRouter'

function AppInner() {
  const { state, dispatch } = useProject()

  function handleUpload(file: File) {
    const videoUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      dispatch({
        type:          'INIT_PROJECT',
        name:          file.name.replace(/\.[^.]+$/, ''),
        videoUrl,
        videoDuration: video.duration,
      })
    }
    video.src = videoUrl
  }

  if (!state.project) {
    return <VideoUpload onUpload={handleUpload} />
  }

  return <ModeRouter />
}

export default function App() {
  return (
    <ProjectProvider>
      <AppInner />
    </ProjectProvider>
  )
}
