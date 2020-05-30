# udpComs

## Instructions
### Server
The server receives messages and runs any commands it is configured to.
If using a config file and deafults you can simply run

```node udpcoms```

If you are specifying commands at runtime and port run

```node udpComs -port 6868 -cmd pad:notepoad,nircmd:/mnt/c/windows/nircmd.exe```

The cmd arguments should be the command name and command/program path seperated by a colon ```cmdName:path``` and multiple commands seperated by commas.

### Client
Send a message with

```node udpcoms -ip 192.169.x.x cmdName optionalArgs```

e.g.
```node udpcoms -ip 192.169.x.x nircmd changesysvolume +10000```

### Config
Using a cmds.config file to save common setting for server

'''
{
  "nircmd": "/mnt/c/windows/nircmd.exe",
  "paint": "/mnt/c/windows/system32/mspaint.exe",
  "pad": "pad",
  "port": "6789"
}
'''
