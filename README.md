# cg-staging

A pair of nodes to save, and reload, a wide range of Comfy data, allowing you to save part way through a run.

I use it when I have a two step workflow that uses two different models, which take a significant amount of time
to load onto the GPU. So I can run a bunch of versions of the first half, saving the outputs, and then run each of them
through the second half.

Also useful if you want to try variations in the second half of a workflow - you can reload the staged file multiple times.

## How it works

The `Save Staged` node has a field `directory`, that specifies where the staged files will be saved (relative to the 
ComfyUI root). It also has, initially, a single input. Connect something to that, and another will appear. See below
for what you can connect.

When the `Save Staged` node is executed it creates a file with a name like `000000_il.safetensors` in the directory specified.
The set of characters after the `_` indicate the datatypes that were connected to the node when it was run. `None` inputs 
are supported (so the inputs are sort-of optional)

The `Load Staged` node has a widget called `fields`. You enter the string of characters from the filename (so `il` in the example above)
and it creates the corresponding outputs (in this case an `Image` and a `Latent`). When you execute the `Load Staged` node it looks
in the specified directory for files ending with the right sequence (`_il`) to load. 

You can also specify whether to wait
if there are no files (wait is a maximum wait time in seconds), whether to delete the file once loaded, and whether to pick the first, 
last, or at random if there are multiple files available.

## Data types

At present the following Comfy data types are supported:

|char|type|
|-|-|
|i|IMAGE|
|m|MASK|
|l|LATENT|
|g|SIGMAS|
|s|STRING|
|n|INT|
|f|FLOAT|

Other types might be added, subject to the requirement that they be a Tensor or relatively easy to convert to one. Adding a new type
requires code in `nodes_staging.py` and `js/staging_dynamics.js`, and I'm happy to get PRs adding them.