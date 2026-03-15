import torch
from safetensors.torch import save_file, load
from comfy_api.latest import io 
from pathlib import Path
from comfy.model_management import InterruptProcessingException, throw_exception_if_processing_interrupted
import time, random
from typing import Callable, Any, Self

class Saveables:
    saveables:dict[str, Self] = {}
    def __init__(self, tag:str, name:str, savemap:Callable[[Any], torch.Tensor]=lambda d:d, loadmap:Callable[[torch.Tensor], Any]=lambda d:d):
        self.tag = tag
        self.name = name
        self.savemap = savemap
        self.loadmap = loadmap
        Saveables.saveables[self.tag] = self

    @classmethod
    def map_to_tensor(cls, tag:str, data:Any) -> torch.Tensor:
        return cls.saveables[tag].savemap(data)
    
    @classmethod
    def map_from_tensor(cls, tag:str, t:torch.Tensor|None):
        return cls.saveables[tag].loadmap(t) if t is not None else None

def str_to_tensor(s:str) -> torch.Tensor: return torch.tensor([int(x) for x in s.encode('utf-8')])
def tensor_to_str(t:torch.Tensor) -> str: return ''.join( [ chr(x) for x in t.tolist() ] )

#
# To add a new type, add it here, and in staging_dynamics.js
#
# If the type is not a tensor, you need to provide a savemap and a loadmap
# savemap:Callable[[Any], torch.Tensor] takes the object and returns a Tensor
# loadmap:Callable[[torch.Tensor], Any] takes a tensor and recreates the object
#
# Default is lambda d:d (ie return the parameter unchanged)
# 
_ = [
    Saveables("i", "image"),
    Saveables("m", "mask"),
    Saveables("g", "sigma",  savemap=lambda d:torch.tensor(d)),
    Saveables("l", "latent", savemap=lambda d:d['samples'],     loadmap=lambda d:{ 'samples':d }),
    Saveables("s", "string", savemap=lambda d:str_to_tensor(d), loadmap=lambda d:tensor_to_str(d) ),
    Saveables("n", "ints",   savemap=lambda d:torch.tensor(d),  loadmap=lambda d:int(d.item())),
    Saveables("f", "floats", savemap=lambda d:torch.tensor(d),  loadmap=lambda d:float(d.item())),
]

FIELDS = "The characters after the _ in the filename indicate the types of data stored in the file:\n" + "\n" + \
      "\n".join( [ f"{s.tag} = {s.name}" for s in Saveables.saveables.values() ] ) + "\n" + \
      "These must be used in the 'fields' field to define the outputs expected"

class SaveStaged(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id        = "Save Staged",
            display_name   = "Save Staged",
            category       = "staging",
            inputs         = [ 
                io.String.Input("directory", default="staged"),
                io.String.Input("active", default="blank for off", tooltip="leave blank to turn saving off"),
                io.String.Input("fields", default="", tooltip="Autopopulated"),
                io.Autogrow.Input('data', template=io.Autogrow.TemplatePrefix(io.AnyType.Input('data'), prefix='data', min=0, max=20), optional=True ) 
            ],  
            outputs        = [
                io.String.Output('filename', display_name='filename')
             ],
            is_output_node = True
        )

    @classmethod
    def execute( cls, directory:str, fields:str, data:dict, active:str="yes" ) -> io.NodeOutput: # type: ignore
        if not active.strip(): return io.NodeOutput( "", )
        assert len(data)==len(fields), f"Mismatched len(items)=={len(data)} != len(fields)=={len(fields)}"
        payload  = { str(index):Saveables.map_to_tensor(tag, item) for index, (tag, item) in enumerate(zip( fields, [data[k] for k in data] )) if item is not None }

        filepath = str(cls.savename(Path(directory), fields))
        save_file( payload, filepath )
        return io.NodeOutput( filepath, )
    
    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return random.random()
    
    @classmethod
    def savename(cls, d:Path, fields:str) -> Path:
        if not d.exists(): d.mkdir(parents=True)
        getpath = lambda i:d / f"{i:0>6}_{fields}.safetensors"
        index = 0
        while (filepath:=getpath(index)).exists(): index += 1
        return filepath
    
class LoadStaged(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="Load Staged",
            display_name="Load Staged",
            category="staging",
            description=FIELDS,
            inputs=[
                io.String.Input("source", default="staged", tooltip="directory containing files, or path to a file (relative to Comfy root)"),
                io.String.Input("fields", default="i", tooltip="A series of characters indicating which fields to load, e.g. 'iml' to load image, mask, and latent data. The filename of the saved file must end in _[fields].safetensors"),
                io.Int.Input("wait", default=0, display_name="wait if none", tooltip=f"Wait for n seconds a file to become available"),
                io.Boolean.Input("delete", display_name="delete after loading", default=True),
                io.Combo.Input("pick", display_name="pick", options=["first", "random", "last"], default="random"),
            ],
            outputs=[
                io.AnyType.Output(f"data{i}") for i in range(20)
            ]
        )     

    @classmethod
    def execute( cls, source: str|Path, fields:str, wait: int, delete: bool, pick: str ) -> io.NodeOutput: # type: ignore
        source = Path(source)

        if not source.exists():
            raise InterruptProcessingException(f"{source} not found")
        elif source.is_file():
            if not cls.compatible(fields, source):
                raise InterruptProcessingException(f"{source} is not a compatible file for fields='{fields}'")
        elif source.is_dir():
            sts = sorted(cls.get_files(fields, source, wait))
            source = random.choice(sts) if pick == "random" else sts[0 if pick == "first" else -1]
        else:
            raise InterruptProcessingException(f"{source} exists but isn't a file or directory?")

        with open(source, 'rb') as fh: d = fh.read()
        data = load(d)
        
        outputs = [ Saveables.map_from_tensor(field, data.get(str(i),None)) for i, field in enumerate(fields) ]

        if delete: 
            try: source.unlink()
            except: print(f"Failed to delete file {source}")

        return io.NodeOutput(*outputs)
    
    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return random.random()
    
    @classmethod
    def compatible(cls, fields:str, path:Path):
        return path.stem.endswith(f"_{fields}") and path.suffix==".safetensors"
    
    @classmethod
    def get_files(cls, fields:str, dir:Path, max_wait:int) -> list[Path]:
        for _ in range(max_wait if max_wait>0 else 1):
            files = [ f for f in dir.iterdir() if cls.compatible(fields, f) ]
            if files: return files
            throw_exception_if_processing_interrupted()
            time.sleep(1)
        raise InterruptProcessingException(f"Timeout waiting for files matching _{fields} in {dir}")
