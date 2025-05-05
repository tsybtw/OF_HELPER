const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const currentPath = process.cwd();
const isWindows = process.platform === 'win32';
let hasErrors = false;

const dependencies = [
   'vite'
];

function warn(message) {
   console.log('\n\x1b[33m%s\x1b[0m\n', message);
}

function info(message) {
    console.log('\n\x1b[36m%s\x1b[0m\n', message);
 }

function fixNpmPermissions() {
   if (!isWindows) {
       try {
           const npmCachePath = path.join(os.homedir(), '.npm');
           console.log('Fixing npm permissions...');
           execSync(`sudo chown -R ${process.getuid()}:${process.getgid()} "${npmCachePath}"`, { stdio: 'inherit' });
           console.log('npm permissions fixed successfully');
       } catch (error) {
           hasErrors = true;
           warn('Failed to fix npm permissions. You might need to run: sudo chown -R $(whoami) ~/.npm');
       }
   }
}

function fixMacOSPermissions() {
    if (!isWindows) {
        console.log('Setting up permissions for files...');
        
        try {
            process.chdir('..');
            console.log(`Changed to server directory: ${process.cwd()}`);
            
            try {
                execSync('sudo xattr -d com.apple.quarantine ./main', { stdio: 'inherit' });
                console.log('Quarantine removed from main successfully');
            } catch (error) {
                info(`Note: ${error.message}. This is normal if the file was not in quarantine.`);
            }
     
            try {
                execSync('sudo chmod +x main', { stdio: 'inherit' });
                console.log('Execute permissions set for main successfully');
            } catch (error) {
                hasErrors = true;
                warn(`Failed to set execute permissions for main: ${error}`);
            }
            
            process.chdir('..');
            console.log(`Changed to parent directory: ${process.cwd()}`);
            
            console.log('Setting up permissions for upd file in update directory...');
            try {
                process.chdir('./update');
                console.log(`Changed to update directory: ${process.cwd()}`);

                try {
                    execSync('sudo xattr -d com.apple.quarantine ./upd', { stdio: 'inherit' });
                    console.log('Quarantine removed from upd successfully');
                } catch (error) {
                    info(`Note: ${error.message}. This is normal if the file was not in quarantine.`);
                }
         
                try {
                    execSync('sudo chmod +x upd', { stdio: 'inherit' });
                    console.log('Execute permissions set for upd successfully');
                } catch (error) {
                    hasErrors = true;
                    warn(`Failed to set execute permissions for upd: ${error}`);
                }

                process.chdir('..');
                console.log(`Returned to parent directory: ${process.cwd()}`);
            } catch (error) {
                hasErrors = true;
                warn(`Error working with update directory: ${error}`);
                
                try {
                    process.chdir('..');
                } catch (e) {
                    warn(`Failed to return to parent directory: ${e}`);
                }
            }
            
            process.chdir('./server/crop');
            console.log(`Returned to original directory: ${process.cwd()}`);
        } catch (error) {
            hasErrors = true;
            warn(`Error working with directories: ${error}`);

            try {
                process.chdir(currentPath);
            } catch (e) {
                warn(`Failed to return to original directory: ${e}`);
            }
        }

        console.log('Setting up ffmpeg and ffprobe permissions in ffmpeg directory...');

        try {
            process.chdir('./ffmpeg'); 
            console.log(`Changed to ffmpeg directory: ${process.cwd()}`);

            try {
                execSync('sudo xattr -r -d com.apple.quarantine ./ffmpeg', { stdio: 'inherit' });
                console.log('Quarantine removed from ffmpeg successfully');
            } catch (error) {
                info(`Note: ${error.message}. This is normal if the file was not in quarantine.`);
            }
     
            try {
                execSync('sudo chmod +x ffmpeg', { stdio: 'inherit' });
                console.log('Execute permissions set for ffmpeg successfully');
            } catch (error) {
                hasErrors = true;
                warn(`Failed to set execute permissions for ffmpeg: ${error}`);
            }

            try {
                execSync('sudo xattr -d com.apple.quarantine ./ffprobe', { stdio: 'inherit' });
                console.log('Quarantine removed from ffprobe successfully');
            } catch (error) {
                info(`Note: ${error.message}. This is normal if the file was not in quarantine.`);
            }
     
            try {
                execSync('sudo chmod +x ffprobe', { stdio: 'inherit' });
                console.log('Execute permissions set for ffprobe successfully');
            } catch (error) {
                hasErrors = true;
                warn(`Failed to set execute permissions for ffprobe: ${error}`);
            }

            process.chdir(currentPath);
            console.log(`Returned to original directory: ${process.cwd()}`);
        } catch (error) {
            hasErrors = true;
            warn(`Error working with ffmpeg directory: ${error}`);

            try {
                process.chdir(currentPath);
            } catch (e) {
                warn(`Failed to return to original directory: ${e}`);
            }
        }

        console.log('Setting up crop permissions in current directory...');
        try {
            execSync('sudo xattr -d com.apple.quarantine ./crop', { stdio: 'inherit' });
            console.log('Quarantine removed from crop successfully');
        } catch (error) {
            info(`Note: ${error.message}. This is normal if the file was not in quarantine.`);
        }
 
        try {
            execSync('sudo chmod +x crop', { stdio: 'inherit' });
            console.log('Execute permissions set for crop successfully');
        } catch (error) {
            hasErrors = true;
            warn(`Failed to set execute permissions for crop: ${error}`);
        }
    }
}

function installDependencies() {
   console.log('Installing dependencies...');
   
   try {
       if (!isWindows) {
           fixNpmPermissions();
       }

       dependencies.forEach(dep => {
           try {
               console.log(`Installing ${dep}...`);
               execSync(`npm install ${dep}`, { stdio: 'inherit' });
           } catch (error) {
               hasErrors = true;
               if (!isWindows) {
                   console.log('Trying with sudo...');
                   try {
                       execSync(`sudo npm install ${dep}`, { stdio: 'inherit' });
                   } catch (sudoError) {
                       warn(`Failed to install ${dep} even with sudo: ${sudoError}`);
                   }
               } else {
                   warn(`Failed to install ${dep}: ${error}`);
               }
           }
       });

       if (!hasErrors) {
           console.log('Dependencies installed successfully');
       }

   } catch (error) {
       hasErrors = true;
       warn(`Error installing dependencies: ${error}`);
   }
}

function main() {
   console.log('Starting setup...');
   console.log(`Current path: ${currentPath}`);
   console.log(`Operating System: ${isWindows ? 'Windows' : 'macOS'}`);

   installDependencies();
   
   if (!isWindows) {
       fixMacOSPermissions();
   }

   if (!hasErrors) {
       console.log('Setup completed successfully!');
   } else {
       console.log('\nSetup completed with some errors. Please check the messages above.');
   }
}

main();
