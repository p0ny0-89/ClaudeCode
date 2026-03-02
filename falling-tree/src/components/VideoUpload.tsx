import { useRef } from 'react'

interface Props {
  onUpload: (file: File) => void
}

export default function VideoUpload({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onUpload(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => inputRef.current?.click()}
      style={{
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        width:         '100vw',
        height:        '100vh',
        cursor:        'pointer',
        border:        '2px dashed #555',
        boxSizing:     'border-box',
      }}
    >
      <p>Drop a video here or click to upload (mp4, mov, webm)</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}
