import { useProject } from '../context/ProjectContext'
import StagingView from './staging/StagingView'
import EditorView from './editor/EditorView'

export default function ModeRouter() {
  const { state } = useProject()
  return state.mode === 'staging' ? <StagingView /> : <EditorView />
}
